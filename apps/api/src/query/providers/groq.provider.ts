import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { groqConfig } from "../../config";
import type { LlmProvider, LlmStructuredResponse } from "./llm-provider.interface";

/**
 * Groq LLM provider — uses the OpenAI-compatible chat completions API
 * hosted at api.groq.com. Default model: groq/compound (compound AI system).
 */
@Injectable()
export class GroqProvider implements LlmProvider {
  readonly name = "groq";
  private readonly logger = new Logger(GroqProvider.name);

  constructor(
    @Inject(groqConfig.KEY)
    private readonly config: ConfigType<typeof groqConfig>,
  ) {
    this.logger.log(`Groq provider initialized: model=${config.model}`);
  }

  async generateAnswer(
    systemPrompt: string,
    userMessage: string,
  ): Promise<LlmStructuredResponse> {
    const content = await this.requestCompletion(systemPrompt, userMessage);
    return this.parseAnswerResponse(content);
  }

  async generateJson<T>(systemPrompt: string, userMessage: string): Promise<T> {
    const content = await this.requestCompletion(systemPrompt, userMessage);
    return this.parseJson<T>(content);
  }

  private async requestCompletion(
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const body = {
      model: this.config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    };

    this.logger.debug(`Calling Groq: model=${this.config.model}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Groq returned empty response");
    }

    return content;
  }

  private parseAnswerResponse(raw: string): LlmStructuredResponse {
    try {
      const parsed = JSON.parse(raw);
      const confidenceScore =
        typeof parsed.confidence_score === "number"
          ? Math.max(0, Math.min(1, parsed.confidence_score))
          : 0;
      return {
        answer: parsed.answer ?? "",
        citation: parsed.citation ?? "",
        confidence_score: confidenceScore,
        answerable: typeof parsed.answerable === "boolean" ? parsed.answerable : confidenceScore >= 0.3,
      };
    } catch {
      this.logger.warn("Failed to parse Groq JSON response, using raw text");
      return {
        answer: raw,
        citation: "",
        confidence_score: 0,
        answerable: false,
      };
    }
  }

  private parseJson<T>(raw: string): T {
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn("Failed to parse Groq JSON response");
      throw error;
    }
  }
}

