import { registerAs } from "@nestjs/config";

export const chromaConfig = registerAs("chroma", () => ({
  host: process.env.CHROMA_HOST ?? "localhost",
  port: parseInt(process.env.CHROMA_PORT ?? "8000", 10),
  collection: process.env.CHROMA_COLLECTION ?? "rfpinator_policies",
}));

export const embeddingConfig = registerAs("embedding", () => ({
  model: process.env.LLAMAINDEX_EMBEDDING_MODEL ?? "text-embedding-3-small",
  apiKey: process.env.OPENAI_API_KEY ?? "",
}));

export const chunkingConfig = registerAs("chunking", () => ({
  chunkSize: parseInt(process.env.LLAMAINDEX_CHUNK_SIZE ?? "512", 10),
  chunkOverlap: parseInt(process.env.LLAMAINDEX_CHUNK_OVERLAP ?? "50", 10),
}));

export const groqConfig = registerAs("groq", () => ({
  apiKey: process.env.GROQ_API_KEY ?? "",
  model: process.env.GROQ_MODEL ?? "groq/compound",
  baseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
}));

export const queryConfig = registerAs("query", () => ({
  /** Default LLM provider: "groq" | "openai" */
  defaultProvider: process.env.DEFAULT_LLM_PROVIDER ?? "groq",
  /** Number of similar chunks to retrieve */
  topK: parseInt(process.env.RAG_TOP_K ?? "5", 10),
  /** OpenAI model for answering (when provider=openai) */
  openaiModel: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
}));

