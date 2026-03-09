import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { embeddingConfig, queryConfig } from "../../config";
import type { LlmProvider, LlmStructuredResponse } from "./llm-provider.interface";

/**
 * OpenAI LLM provider — uses the standard OpenAI chat completions API.
 * Reuses the OPENAI_API_KEY from the embedding config.
 */
@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name = "openai";
  private readonly logger = new Logger(OpenAiProvider.name);

  constructor(
    @Inject(embeddingConfig.KEY)
    private readonly embedCfg: ConfigType<typeof embeddingConfig>,
    @Inject(queryConfig.KEY)
    private readonly queryCfg: ConfigType<typeof queryConfig>,
  ) {
    this.logger.log(`OpenAI provider initialized: model=${queryCfg.openaiModel}`);
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
    const url = "https://api.openai.com/v1/chat/completions";
    const body = {
      model: this.queryCfg.openaiModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    };

    this.logger.debug(`Calling OpenAI: model=${this.queryCfg.openaiModel}`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.embedCfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI returned empty response");
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
      this.logger.warn("Failed to parse OpenAI JSON response, using raw text");
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
      this.logger.warn("Failed to parse OpenAI JSON response");
      throw error;
    }
  }
}

