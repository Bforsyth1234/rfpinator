import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { queryConfig } from "../config";
import { EmbeddingService } from "../ingestion/embedding.service";
import { VectorStoreService } from "../ingestion/vector-store.service";
import type { LlmProvider } from "./providers";
import { GroqProvider } from "./providers";
import { OpenAiProvider } from "./providers";
import type {
  RagQueryRequest,
  RagQueryResponse,
  Citation,
  RetrievedChunk,
} from "@rfpinator/shared";

const RAG_SYSTEM_PROMPT = `You are an expert security and compliance analyst answering RFP and security questionnaire questions.
You MUST respond with valid JSON matching this exact schema:
{
  "answer": "<your detailed answer based ONLY on the provided context>",
  "citation": "<source document name(s) and section(s) that support your answer>",
  "confidence_score": <number between 0 and 1 reflecting how well the context supports your answer>
}

Rules:
- Base your answer ONLY on the provided context chunks.
- If the context does not contain enough information, say so and set confidence_score below 0.3.
- The citation field must reference specific source documents from the context metadata.
- Always respond with valid JSON. No markdown, no extra text.`;

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
    const providerKey = this.resolveProvider(request);
    const provider = this.providers.get(providerKey);
    if (!provider) {
      throw new Error(
        `Unknown LLM provider: "${providerKey}". Available: ${[...this.providers.keys()].join(", ")}`,
      );
    }

    this.logger.log(
      `RAG query: provider=${providerKey}, question="${request.question.slice(0, 80)}..."`,
    );

    // 1. Embed the question
    const queryEmbedding = await this.embeddingService.embedText(
      request.question,
    );

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
      };
    }

    // 4. Construct user message with context
    const userMessage = `Context chunks:\n${contextText}\n\nQuestion: ${request.question}`;

    // 5. Call the LLM provider
    const llmResponse = await provider.generateAnswer(
      RAG_SYSTEM_PROMPT,
      userMessage,
    );

    // 6. Map LLM response to API contract
    return {
      answer: llmResponse.answer,
      citations: this.parseCitations(llmResponse.citation, citations),
      confidenceScore: llmResponse.confidence_score,
      model: providerKey,
      retrievedChunks,
    };
  }


  /**
   * Resolve which provider to use based on request fields.
   * Priority: model_choice > model > config default.
   */
  private resolveProvider(request: RagQueryRequest): string {
    if (request.model_choice) return request.model_choice;
    if (request.model) return request.model;
    return this.config.defaultProvider;
  }

  /**
   * Build context text and structured chunk data from ChromaDB query results.
   */
  private buildContext(results: any): {
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
      // ChromaDB returns distances; convert to similarity score (1 - distance for L2)
      const score = distances[i] != null ? Math.max(0, 1 - distances[i]) : 0;

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
