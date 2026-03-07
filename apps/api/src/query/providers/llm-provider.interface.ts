/**
 * Structured response expected from the answering LLM.
 */
export interface LlmStructuredResponse {
  answer: string;
  citation: string;
  confidence_score: number;
}

/**
 * Abstraction for LLM providers used in the RAG answering step.
 * Each provider wraps an OpenAI-compatible chat completions API.
 */
export interface LlmProvider {
  /** Human-readable provider name (e.g. "groq", "openai") */
  readonly name: string;

  /**
   * Generate a structured answer given a system prompt and user message.
   * Implementations must parse the LLM output into LlmStructuredResponse.
   */
  generateAnswer(
    systemPrompt: string,
    userMessage: string,
  ): Promise<LlmStructuredResponse>;
}

