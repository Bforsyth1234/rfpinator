import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { embeddingConfig } from "../config";

/** Scores returned by the LLM judge for a single evaluation item. */
export interface JudgeScores {
  /** 1–5: How well the retrieved context matches the expected sources and covers the question. */
  retrievalScore: number;
  /** 1–5: How faithful the generated answer is to the retrieved context (no hallucination). */
  faithfulnessScore: number;
  /** 1–5: How correct and complete the generated answer is compared to the expected answer. */
  answerScore: number;
  /** Brief explanation from the judge for the scores */
  reasoning: string;
}

/** Scores plus the prompts used for auditability */
export interface JudgeResult extends JudgeScores {
  /** The system prompt sent to the judge */
  judgeSystemPrompt: string;
  /** The user message sent to the judge */
  judgeUserMessage: string;
}

export const JUDGE_SYSTEM_PROMPT = `You are an expert evaluation judge for a RAG (Retrieval-Augmented Generation) system.
You will be given:
- A question
- The expected (ideal) answer
- The generated answer from the RAG system
- The retrieved context chunks used to generate the answer
- The expected source documents
- The actual cited source documents

Score the following three metrics on a scale of 1 to 5:

1. **Retrieval Precision** (1-5): How well do the retrieved context chunks and cited sources match the expected sources and cover the information needed to answer the question?
   - 5: Perfect retrieval — all expected sources found, context is highly relevant
   - 3: Partial retrieval — some relevant context found but missing key sources
   - 1: Poor retrieval — irrelevant context, none of the expected sources found

2. **Faithfulness** (1-5): How faithful is the generated answer to the retrieved context? Does it avoid hallucination?
   - 5: Fully faithful — answer is entirely grounded in the retrieved context
   - 3: Partially faithful — some claims are supported, others are not in the context
   - 1: Unfaithful — answer contains significant hallucinated information
   IMPORTANT: If the generated answer is factually correct and matches the expected answer, do NOT penalize it even if the retrieved context does not contain every detail. The goal is to detect harmful hallucinations, not to penalize correct answers.

3. **Answer Correctness** (1-5): How correct and complete is the generated answer compared to the expected answer?
   - 5: Perfect — the generated answer fully matches the expected answer in meaning and completeness
   - 3: Partial — the generated answer captures some key points but misses important details
   - 1: Incorrect — the generated answer is wrong or completely misses the point

Respond with ONLY valid JSON matching this schema:
{
  "retrievalScore": <number 1-5>,
  "faithfulnessScore": <number 1-5>,
  "answerScore": <number 1-5>,
  "reasoning": "<1-2 sentence explanation of why you gave these scores>"
}`;

@Injectable()
export class JudgeService {
  private readonly logger = new Logger(JudgeService.name);
  private readonly apiKey: string;

  constructor(
    @Inject(embeddingConfig.KEY)
    private readonly embedCfg: ConfigType<typeof embeddingConfig>,
  ) {
    this.apiKey = embedCfg.apiKey;
    this.logger.log("JudgeService initialized (GPT-4.1 judge)");
  }

  /**
   * Use GPT-4.1 to score a single RAG evaluation item.
   */
  async score(params: {
    question: string;
    expectedAnswer: string;
    generatedAnswer: string;
    retrievedContext: string;
    expectedSources: string[];
    citedSources: string[];
    /** Optional custom system prompt to override the default JUDGE_SYSTEM_PROMPT */
    systemPrompt?: string;
  }): Promise<JudgeResult> {
    const systemPrompt = params.systemPrompt ?? JUDGE_SYSTEM_PROMPT;
    const userMessage = `Question: ${params.question}

Expected Answer: ${params.expectedAnswer}

Generated Answer: ${params.generatedAnswer}

Retrieved Context:
${params.retrievedContext || "(no context retrieved)"}

Expected Sources: ${params.expectedSources.join(", ") || "(none)"}
Cited Sources: ${params.citedSources.join(", ") || "(none)"}`;

    const body = {
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.0,
      response_format: { type: "json_object" },
    };

    this.logger.debug(`Calling GPT-4.1 judge for: "${params.question.slice(0, 60)}..."`);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI judge API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("GPT-4.1 judge returned empty response");
    }

    const scores = this.parseScores(content);
    return {
      ...scores,
      judgeSystemPrompt: systemPrompt,
      judgeUserMessage: userMessage,
    };
  }

  private parseScores(raw: string): JudgeScores {
    try {
      const parsed = JSON.parse(raw);
      return {
        retrievalScore: this.clampScore(parsed.retrievalScore),
        faithfulnessScore: this.clampScore(parsed.faithfulnessScore),
        answerScore: this.clampScore(parsed.answerScore),
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      };
    } catch {
      this.logger.warn("Failed to parse judge response, defaulting to score 1");
      return { retrievalScore: 1, faithfulnessScore: 1, answerScore: 1, reasoning: "" };
    }
  }

  private clampScore(value: unknown): number {
    const num = typeof value === "number" ? value : 1;
    return Math.max(1, Math.min(5, Math.round(num)));
  }
}

