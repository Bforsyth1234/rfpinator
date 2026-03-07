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

// ── Questionnaire ───────────────────────────

export interface QuestionnaireRow {
  id: string;
  question: string;
  answer?: string;
  citations?: Citation[];
  confidenceScore?: number;
  /** User review status */
  status: "pending" | "approved" | "edited";
}

// ── Evaluation ──────────────────────────────

export interface GoldenDatasetEntry {
  question: string;
  expectedAnswer: string;
  expectedSources: string[];
}

export interface EvalResult {
  question: string;
  generatedAnswer: string;
  expectedAnswer: string;
  faithfulnessScore: number;
  retrievalScore: number;
  citedSources: string[];
  expectedSources: string[];
}

export interface EvalSummary {
  totalQuestions: number;
  avgFaithfulness: number;
  avgRetrieval: number;
  results: EvalResult[];
}

