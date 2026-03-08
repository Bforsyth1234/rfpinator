import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { queryConfig } from "../config";
import { EmbeddingService } from "../ingestion/embedding.service";
import { VectorStoreService } from "../ingestion/vector-store.service";
import type { LlmProvider } from "./providers";
import { GroqProvider } from "./providers";
import { OpenAiProvider } from "./providers";
import type {
  QuestionnaireColumnDetectionRequest,
  QuestionnaireColumnDetectionResponse,
  QuestionnaireRowClassificationRequest,
  QuestionnaireRowClassificationResponse,
  RagQueryRequest,
  RagQueryResponse,
  Citation,
  RetrievedChunk,
} from "@rfpinator/shared";

type QueryResultMetadata = {
  source?: string;
  pageOrSection?: string;
};

type VectorQueryResults = {
  documents?: Array<Array<string | null>>;
  metadatas?: Array<Array<QueryResultMetadata | null>>;
  distances?: Array<Array<number | null>>;
};

export const RAG_SYSTEM_PROMPT = `You are an expert security and compliance analyst answering RFP and security questionnaire questions.
You MUST respond with valid JSON matching this exact schema:
{
  "answer": "<your detailed answer based ONLY on the provided context>",
  "citation": "<source document name(s) and section(s) that support your answer>",
  "confidence_score": <number between 0 and 1 reflecting how well the context supports your answer>,
  "answerable": <boolean — true if you can meaningfully answer the question from the context, false otherwise>
}

Rules:
- Base your answer ONLY on the provided context chunks.
- If the context does not contain enough information to meaningfully answer the question, say so, set confidence_score below 0.3, and set answerable to false.
- Set answerable to true only when the provided context contains sufficient information to give a substantive, useful answer.
- The citation field must reference specific source documents from the context metadata.
- Always respond with valid JSON. No markdown, no extra text.`;

const QUESTIONNAIRE_COLUMN_DETECTION_PROMPT = `You analyze uploaded spreadsheet questionnaire samples.
You MUST respond with valid JSON matching this exact schema:
{
  "headerRowIndex": <0-based integer>,
  "questionColumnIndex": <0-based integer>,
  "answerColumnIndex": <0-based integer or null>
}

Rules:
- Use 0-based indices.
- The header row is the row that labels the table columns.
- The question column contains the actual questionnaire prompts, requirements, control specifications, or descriptions to be answered — NOT short ID/code columns.
- If multiple columns have similar headers (e.g. "Control ID" vs "Control Specification"), always pick the column whose data cells contain the longest descriptive text, not the one with short codes or identifiers.
- The answer column should be an existing response/answer/comments column if one already exists.
- If there is no clear existing answer column, set answerColumnIndex to null.
- Prefer columns with headers like question, prompt, requirement, control specification, description, answer, response, reply, remarks, or comments.
- Avoid columns whose data cells are short identifiers, codes, or IDs (e.g. "A&A-02", "CCC-06").
- Only return JSON. No markdown, no explanation.`;

const QUESTIONNAIRE_ROW_CLASSIFICATION_PROMPT = `You classify rows extracted from a spreadsheet questionnaire.
For each row you receive, determine whether it is:
- A real question, requirement, or control specification that needs an answer (isQuestion = true)
- A section title, heading, label, category name, footer, or non-question text (isQuestion = false)

You MUST respond with valid JSON matching this exact schema:
{
  "classifications": [
    { "id": "<row id>", "isQuestion": <true or false> }
  ]
}

Rules:
- Return one entry per input row, preserving the same "id" values.
- Section titles/headings are short labels like "Audit & Assurance - A&A" or "End of Standard".
- Real questions/requirements are longer and describe specific controls, policies, or actions to implement.
- If in doubt, classify as a question (isQuestion = true).
- Only return JSON. No markdown, no explanation.`;

const QUESTIONNAIRE_ROW_CLASSIFICATION_BATCH_SIZE = 50;

const QUESTION_HEADER_PATTERN =
  /(question|prompt|requirement|control|item|description|request)/i;
const ANSWER_HEADER_PATTERN = /(answer|response|reply|remarks?|comments?)/i;

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);
  private readonly providers: Map<string, LlmProvider>;

  constructor(
    @Inject(queryConfig.KEY)
    private readonly config: ConfigType<typeof queryConfig>,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStoreService,
    private readonly groqProvider: GroqProvider,
    private readonly openAiProvider: OpenAiProvider,
  ) {
    this.providers = new Map<string, LlmProvider>([
      ["groq", groqProvider],
      ["openai", openAiProvider],
    ]);
    this.logger.log(
      `QueryService initialized: defaultProvider=${config.defaultProvider}, topK=${config.topK}`,
    );
  }

  /**
   * Execute a RAG query: embed question → retrieve chunks → generate answer.
   */
  async query(request: RagQueryRequest): Promise<RagQueryResponse> {
    const question = this.validateQuestion(request.question);
    const providerKey = this.resolveProvider(request);
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new Error(
        `Unknown LLM provider: "${providerKey}". Available: ${[...this.providers.keys()].join(", ")}`,
      );
    }

    this.logger.log(
      `RAG query: provider=${providerKey}, question="${question.slice(0, 80)}..."`,
    );

    // 1. Embed the question
    const queryEmbedding = await this.embeddingService.embedText(question);

    // 2. Similarity search against ChromaDB
    const collection = this.vectorStore.getCollection();
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: this.config.topK,
    });

    // 3. Build context from retrieved chunks
    const { contextText, retrievedChunks, citations } =
      this.buildContext(results);

    if (retrievedChunks.length === 0) {
      return {
        answer:
          "No relevant context was found in the knowledge base to answer this question.",
        citations: [],
        confidenceScore: 0,
        model: `${providerKey}`,
        retrievedChunks: [],
        answerable: false,
      };
    }

    // 4. Construct user message with context
    const userMessage = `Context chunks:\n${contextText}\n\nQuestion: ${question}`;

    // 5. Call the LLM provider
    const llmResponse = await provider.generateAnswer(
      RAG_SYSTEM_PROMPT,
      userMessage,
    );

    // 6. Determine answerability — trust the LLM field, but also check
    //    the answer text for common "I can't answer" patterns as a fallback.
    const answerable = this.isAnswerable(
      llmResponse.answerable,
      llmResponse.answer,
      llmResponse.confidence_score,
    );

    // 7. Map LLM response to API contract
    return {
      answer: llmResponse.answer,
      citations: this.parseCitations(llmResponse.citation, citations),
      confidenceScore: llmResponse.confidence_score,
      model: providerKey,
      retrievedChunks,
      answerable,
    };
  }

  async detectQuestionnaireColumns(
    request: QuestionnaireColumnDetectionRequest,
  ): Promise<QuestionnaireColumnDetectionResponse> {
    const rows = this.validateQuestionnaireRows(request.rows);
    const providerKey = this.resolveProvider(request);
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new Error(
        `Unknown LLM provider: "${providerKey}". Available: ${[...this.providers.keys()].join(", ")}`,
      );
    }

    const fallback = this.detectColumnsHeuristically(rows);
    const userMessage = [
      `Filename: ${request.fileName ?? "unknown"}`,
      "Spreadsheet sample rows (0-based):",
      JSON.stringify(rows.map((row, index) => ({ rowIndex: index, cells: row }))),
    ].join("\n\n");

    try {
      const llmDetection = await provider.generateJson<Record<string, unknown>>(
        QUESTIONNAIRE_COLUMN_DETECTION_PROMPT,
        userMessage,
      );

      return this.normalizeQuestionnaireDetection(llmDetection, rows, fallback);
    } catch (error) {
      this.logger.warn(
        `Questionnaire column detection fell back to heuristics: ${error instanceof Error ? error.message : String(error)}`,
      );
      return fallback;
    }
  }

  async classifyQuestionnaireRows(
    request: QuestionnaireRowClassificationRequest,
  ): Promise<QuestionnaireRowClassificationResponse> {
    if (!Array.isArray(request.rows) || request.rows.length === 0) {
      throw new BadRequestException("Rows must be a non-empty array.");
    }

    const providerKey = this.resolveProvider(request);
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new Error(
        `Unknown LLM provider: "${providerKey}". Available: ${[...this.providers.keys()].join(", ")}`,
      );
    }

    // Process in batches to stay within token limits
    const allClassifications: Array<{ id: string; isQuestion: boolean }> = [];

    for (
      let i = 0;
      i < request.rows.length;
      i += QUESTIONNAIRE_ROW_CLASSIFICATION_BATCH_SIZE
    ) {
      const batch = request.rows.slice(
        i,
        i + QUESTIONNAIRE_ROW_CLASSIFICATION_BATCH_SIZE,
      );
      const userMessage = JSON.stringify(
        batch.map((r) => ({ id: r.id, text: String(r.text ?? "").slice(0, 500) })),
      );

      try {
        const result = await provider.generateJson<{
          classifications?: Array<{ id: string; isQuestion: boolean }>;
        }>(QUESTIONNAIRE_ROW_CLASSIFICATION_PROMPT, userMessage);

        if (Array.isArray(result.classifications)) {
          allClassifications.push(...result.classifications);
        } else {
          // Fallback: treat all as questions
          allClassifications.push(
            ...batch.map((r) => ({ id: r.id, isQuestion: true })),
          );
        }
      } catch (error) {
        this.logger.warn(
          `Row classification batch failed, treating all as questions: ${error instanceof Error ? error.message : String(error)}`,
        );
        allClassifications.push(
          ...batch.map((r) => ({ id: r.id, isQuestion: true })),
        );
      }
    }

    return { classifications: allClassifications };
  }

  /**
   * Determine if the answer is truly answerable.
   * Uses the LLM's explicit field, but also checks the answer text for
   * common "I can't answer" phrases as a safety net.
   */
  private isAnswerable(
    llmAnswerable: boolean,
    answerText: string,
    confidenceScore: number,
  ): boolean {
    // If the LLM explicitly said false, trust it
    if (!llmAnswerable) return false;

    // Even if the LLM said true, check the answer text for unanswerable patterns
    const lower = answerText.toLowerCase();
    const unanswerablePatterns = [
      "does not contain enough information",
      "does not contain information",
      "does not contain sufficient",
      "does not explicitly mention",
      "does not explicitly address",
      "does not explicitly cover",
      "does not specifically mention",
      "does not specifically address",
      "no information provided",
      "no information about",
      "no relevant context",
      "there is no information provided",
      "there is no information about",
      "not contain enough information",
      "cannot be determined from",
      "cannot be answered",
      "no information available",
      "insufficient context",
      "not mentioned in the provided context",
      "not addressed in the provided context",
      "not covered in the provided context",
      "context does not cover",
      "context does not include",
      "context does not provide",
      "context does not mention",
      "context does not address",
      "context does not explicitly",
      "context does not specifically",
      "not directly addressed",
      "not directly mentioned",
      "not directly covered",
      "i cannot provide a definitive answer",
      "unable to provide a definitive answer",
      "unable to answer",
      "i don't have enough information",
    ];

    if (unanswerablePatterns.some((p) => lower.includes(p))) {
      return false;
    }

    // Low confidence is also a signal
    if (confidenceScore < 0.3) return false;

    return true;
  }

  private validateQuestion(question: unknown): string {
    if (typeof question !== "string" || !question.trim()) {
      throw new BadRequestException("Question must be a non-empty string.");
    }

    return question.trim();
  }


  /**
   * Resolve which provider to use based on request fields.
   * Priority: model_choice > model > config default.
   */
  private resolveProvider(request: { model_choice?: string; model?: string }): string {
    if (request.model_choice) return request.model_choice;
    if (request.model) return request.model;
    return this.config.defaultProvider;
  }

  private validateQuestionnaireRows(rows: unknown): string[][] {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new BadRequestException("Questionnaire rows must be a non-empty 2D array.");
    }

    const sampledRows = rows.slice(0, 25).map((row) => {
      if (!Array.isArray(row)) {
        throw new BadRequestException(
          "Questionnaire rows must be a non-empty 2D array.",
        );
      }

      return row.slice(0, 30).map((cell) => String(cell ?? "").trim().slice(0, 500));
    });

    if (sampledRows.every((row) => row.every((cell) => cell.length === 0))) {
      throw new BadRequestException("Questionnaire rows must contain at least one non-empty cell.");
    }

    return sampledRows;
  }

  private detectColumnsHeuristically(
    rows: string[][],
  ): QuestionnaireColumnDetectionResponse {
    const headerRowIndex = this.findHeaderRowIndex(rows);
    const headerRow = rows[headerRowIndex] ?? [];
    const dataRows = rows.slice(headerRowIndex + 1);
    const questionColumnIndex = this.detectQuestionColumnIndex(headerRow, dataRows);
    const answerColumnIndex = this.detectColumnByHeader(headerRow, ANSWER_HEADER_PATTERN);

    return {
      headerRowIndex,
      questionColumnIndex,
      answerColumnIndex: answerColumnIndex >= 0 ? answerColumnIndex : undefined,
    };
  }

  private normalizeQuestionnaireDetection(
    detection: Record<string, unknown>,
    rows: string[][],
    fallback: QuestionnaireColumnDetectionResponse,
  ): QuestionnaireColumnDetectionResponse {
    const rowCount = rows.length;
    const columnCount = Math.max(...rows.map((row) => row.length), 1);
    const headerRowIndex =
      this.parseBoundedIndex(detection.headerRowIndex, rowCount) ??
      fallback.headerRowIndex;
    const questionColumnIndex =
      this.parseBoundedIndex(detection.questionColumnIndex, columnCount) ??
      fallback.questionColumnIndex;
    const answerColumnIndex = this.parseBoundedIndex(
      detection.answerColumnIndex,
      columnCount,
    );

    return {
      headerRowIndex,
      questionColumnIndex,
      answerColumnIndex:
        answerColumnIndex != null && answerColumnIndex !== questionColumnIndex
          ? answerColumnIndex
          : fallback.answerColumnIndex,
    };
  }

  private parseBoundedIndex(value: unknown, upperExclusive: number): number | undefined {
    if (value == null) return undefined;
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return undefined;
    }
    if (value < 0 || value >= upperExclusive) {
      return undefined;
    }
    return value;
  }

  private findHeaderRowIndex(rows: string[][]): number {
    let bestIndex = 0;
    let bestScore = -1;

    for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
      const nonEmptyCells = rows[i].filter((cell) => cell.length > 0);
      if (nonEmptyCells.length === 0) continue;

      const headerMatches = nonEmptyCells.filter((cell) => {
        return QUESTION_HEADER_PATTERN.test(cell) || ANSWER_HEADER_PATTERN.test(cell);
      }).length;

      const score = headerMatches * 10 + nonEmptyCells.length;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  private detectQuestionColumnIndex(headerRow: string[], dataRows: string[][]): number {
    const columnCount = Math.max(
      headerRow.length,
      ...dataRows.slice(0, 20).map((row) => row.length),
      1,
    );

    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const headerValue = headerRow[columnIndex] ?? "";
      const sampleCells = dataRows
        .slice(0, 20)
        .map((row) => String(row[columnIndex] ?? "").trim())
        .filter(Boolean);

      if (sampleCells.length === 0) continue;

      const averageLength =
        sampleCells.reduce((sum, cell) => sum + cell.length, 0) / sampleCells.length;
      const questionLikeCells = sampleCells.filter(
        (cell) => cell.endsWith("?") || cell.length >= 20,
      ).length;
      const headerScore = QUESTION_HEADER_PATTERN.test(headerValue) ? 100 : 0;
      // Penalize columns that look like short ID/code columns
      const looksLikeIdColumn = averageLength < 12 && headerScore > 0;
      const idPenalty = looksLikeIdColumn ? -80 : 0;
      const score = headerScore + idPenalty + questionLikeCells * 4 + averageLength / 10;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = columnIndex;
      }
    }

    return bestIndex;
  }

  private detectColumnByHeader(headerRow: string[], pattern: RegExp): number {
    return headerRow.findIndex((cell) => pattern.test(cell));
  }

  /**
   * Build context text and structured chunk data from ChromaDB query results.
   */
  private buildContext(results: VectorQueryResults): {
    contextText: string;
    retrievedChunks: RetrievedChunk[];
    citations: Citation[];
  } {
    const documents = results.documents?.[0] ?? [];
    const metadatas = results.metadatas?.[0] ?? [];
    const distances = results.distances?.[0] ?? [];

    const retrievedChunks: RetrievedChunk[] = [];
    const citations: Citation[] = [];
    const contextParts: string[] = [];

    for (let i = 0; i < documents.length; i++) {
      const text = documents[i] ?? "";
      const meta = metadatas[i] ?? {};
      const distance = distances[i];
      // ChromaDB returns distances; convert to similarity score (1 - distance for L2)
      const score = distance != null ? Math.max(0, 1 - distance) : 0;

      if (!text) continue;

      retrievedChunks.push({
        text,
        source: meta.source ?? "unknown",
        pageOrSection: meta.pageOrSection || undefined,
        score,
      });

      citations.push({
        source: meta.source ?? "unknown",
        text: text.slice(0, 200),
        page: this.extractPageNumber(meta.pageOrSection),
      });

      contextParts.push(
        `[Chunk ${i + 1} | Source: ${meta.source ?? "unknown"} | Section: ${meta.pageOrSection ?? "N/A"}]\n${text}`,
      );
    }

    return {
      contextText: contextParts.join("\n\n"),
      retrievedChunks,
      citations,
    };
  }

  /**
   * Parse the LLM's citation string and merge with retrieved chunk citations.
   * Returns deduplicated citations grounded in actual source metadata.
   */
  private parseCitations(
    llmCitation: string,
    retrievedCitations: Citation[],
  ): Citation[] {
    if (!llmCitation || retrievedCitations.length === 0) {
      return retrievedCitations;
    }

    // Deduplicate by source
    const seen = new Set<string>();
    const deduped: Citation[] = [];
    for (const c of retrievedCitations) {
      if (!seen.has(c.source)) {
        seen.add(c.source);
        deduped.push(c);
      }
    }
    return deduped;
  }

  /**
   * Extract a numeric page number from a pageOrSection string.
   * Returns the page number for strings like "Page 3", or undefined for section headings.
   */
  private extractPageNumber(pageOrSection?: string): number | undefined {
    if (!pageOrSection) return undefined;
    const match = pageOrSection.match(/^Page\s+(\d+)$/i);
    return match ? parseInt(match[1], 10) : undefined;
  }

  /**
   * Get available provider names (for frontend dropdown).
   */
  getAvailableProviders(): string[] {
    return [...this.providers.keys()];
  }
}
