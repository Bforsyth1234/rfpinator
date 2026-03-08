/**
 * Shared request/response contracts for the RFPinator API.
 */

// ── RAG Query ───────────────────────────────

export interface RagQueryRequest {
  question: string;
  /** Optional model override (defaults to Groq model on backend) */
  model?: string;
  /**
   * Model choice identifier for the frontend dropdown.
   * Supported values: "groq" (default), "openai".
   * Takes precedence over `model` if both are provided.
   */
  model_choice?: string;
}

export interface Citation {
  /** Source document filename or path */
  source: string;
  /** Relevant chunk text */
  text: string;
  /** Page number if available */
  page?: number;
}

/** A single chunk retrieved from the vector store, for auditability */
export interface RetrievedChunk {
  /** The chunk text */
  text: string;
  /** Source document filename */
  source: string;
  /** Page or section label */
  pageOrSection?: string;
  /** Similarity score from vector search */
  score: number;
}

export interface RagQueryResponse {
  answer: string;
  citations: Citation[];
  /** 0–1 confidence score from the answering model */
  confidenceScore: number;
  /** Model used for this response */
  model: string;
  /** Retrieved context chunks for auditability */
  retrievedChunks?: RetrievedChunk[];
  /** Whether the AI had enough context to meaningfully answer the question */
  answerable: boolean;
}

export interface QuestionnaireColumnDetectionRequest {
  /** Optional questionnaire filename for model context */
  fileName?: string;
  /** Sampled spreadsheet rows as 0-based arrays of cell strings */
  rows: string[][];
  /** Optional model override */
  model?: string;
  /** Optional provider choice from the frontend */
  model_choice?: string;
}

export interface QuestionnaireColumnDetectionResponse {
  /** 0-based header row index */
  headerRowIndex: number;
  /** 0-based question column index */
  questionColumnIndex: number;
  /** 0-based answer column index if an answer/response column already exists */
  answerColumnIndex?: number;
}

// ── Questionnaire Row Classification ────────

export interface QuestionnaireRowClassificationRequest {
  /** Candidate rows to classify — each has an id and the extracted text */
  rows: Array<{ id: string; text: string }>;
  /** Optional model override */
  model?: string;
  /** Optional provider choice from the frontend */
  model_choice?: string;
}

export interface QuestionnaireRowClassificationResponse {
  /** One entry per input row: true = real question/requirement, false = title/header/label */
  classifications: Array<{ id: string; isQuestion: boolean }>;
}

// ── Document Ingestion ──────────────────────

export interface IngestRequest {
  /** File path or identifier for the uploaded document */
  filePath: string;
  /** MIME type hint */
  mimeType?: string;
}

/** Request body for directory-based ingestion */
export interface IngestDirectoryRequest {
  /** Absolute or repo-relative path to a directory of policy documents */
  directoryPath: string;
  /** Optional glob pattern to filter files (default: *.md,*.pdf) */
  glob?: string;
}

export interface IngestResponse {
  documentId: string;
  chunksCreated: number;
  status: "success" | "error";
  message?: string;
}

/** Response for batch / directory ingestion */
export interface IngestBatchResponse {
  results: IngestResponse[];
  totalDocuments: number;
  totalChunks: number;
}

/** Metadata stored alongside each vector chunk for citation */
export interface ChunkMetadata {
  /** Original source filename */
  source: string;
  /** Page number (PDF) or section heading (Markdown) */
  pageOrSection?: string;
  /** 0-based chunk index within the document */
  chunkIndex: number;
  /** Unique document identifier */
  documentId: string;
}

/** Summary info about a document stored in the vector store */
export interface DocumentInfo {
  /** Unique document identifier */
  documentId: string;
  /** Original filename */
  source: string;
  /** Number of chunks stored for this document */
  chunkCount: number;
}

// ── Questionnaire ───────────────────────────

export interface QuestionnaireRowLocation {
  /** Sheet/tab name (XLSX) */
  sheetName?: string;
  /** 1-based row number as displayed in the spreadsheet */
  row: number;
  /** Column letter (A, B, C, …) */
  column: string;
}

export interface QuestionnaireRow {
  id: string;
  question: string;
  answer?: string;
  citations?: Citation[];
  confidenceScore?: number;
  /** User review status */
  status: "pending" | "approved" | "edited";
  /** Location of the question in the original file */
  location?: QuestionnaireRowLocation;
  /** Whether the AI had enough context to meaningfully answer the question */
  answerable?: boolean;
}

// ── Evaluation ──────────────────────────────

export interface GoldenDatasetEntry {
  question: string;
  expectedAnswer: string;
  expectedSources: string[];
}

/** Prompts captured during a single evaluation question */
export interface EvalPrompts {
  /** System prompt sent to the RAG LLM */
  ragSystemPrompt: string;
  /** User message sent to the RAG LLM (includes retrieved context + question) */
  ragUserMessage: string;
  /** System prompt sent to the GPT-4o judge */
  judgeSystemPrompt: string;
  /** User message sent to the GPT-4o judge */
  judgeUserMessage: string;
}

export interface EvalResult {
  question: string;
  generatedAnswer: string;
  expectedAnswer: string;
  faithfulnessScore: number;
  retrievalScore: number;
  citedSources: string[];
  expectedSources: string[];
  /** Full prompts used for this question (RAG + judge) */
  prompts?: EvalPrompts;
}

export interface EvalSummary {
  totalQuestions: number;
  avgFaithfulness: number;
  avgRetrieval: number;
  results: EvalResult[];
}

/** A persisted evaluation run */
export interface SavedEvalRun {
  /** Unique ID for this run */
  id: string;
  /** ISO-8601 timestamp of when the run was executed */
  createdAt: string;
  /** LLM provider used (e.g. "groq", "openai") */
  provider: string;
  /** Full evaluation summary with per-question results */
  summary: EvalSummary;
}

/** Lightweight listing entry (no per-question results) */
export interface SavedEvalRunListItem {
  id: string;
  createdAt: string;
  provider: string;
  totalQuestions: number;
  avgFaithfulness: number;
  avgRetrieval: number;
}

