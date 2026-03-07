import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import type {
  GoldenDatasetEntry,
  EvalResult,
  EvalSummary,
  RagQueryResponse,
} from "@rfpinator/shared";
import { QueryService } from "../query/query.service";
import { JudgeService } from "./judge.service";

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly queryService: QueryService,
    private readonly judgeService: JudgeService,
  ) {}

  /**
   * Load a golden dataset from a JSON file path.
   */
  loadDataset(filePath: string): GoldenDatasetEntry[] {
    const resolved = path.resolve(filePath);
    this.logger.log(`Loading golden dataset from: ${resolved}`);
    const raw = fs.readFileSync(resolved, "utf-8");
    const entries: GoldenDatasetEntry[] = JSON.parse(raw);

    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error(`Invalid or empty golden dataset at ${resolved}`);
    }

    for (const entry of entries) {
      if (!entry.question || !entry.expectedAnswer) {
        throw new Error(
          `Dataset entry missing required fields: ${JSON.stringify(entry).slice(0, 100)}`,
        );
      }
    }

    this.logger.log(`Loaded ${entries.length} evaluation entries`);
    return entries;
  }

  /**
   * Run the full evaluation pipeline: query RAG → judge → aggregate.
   */
  async evaluate(
    dataset: GoldenDatasetEntry[],
    options?: { provider?: string },
  ): Promise<EvalSummary> {
    const results: EvalResult[] = [];

    for (let i = 0; i < dataset.length; i++) {
      const entry = dataset[i];
      this.logger.log(
        `Evaluating [${i + 1}/${dataset.length}]: "${entry.question.slice(0, 60)}..."`,
      );

      try {
        const result = await this.evaluateEntry(entry, options?.provider);
        results.push(result);
        this.logger.log(
          `  → retrieval=${result.retrievalScore}/5, faithfulness=${result.faithfulnessScore}/5`,
        );
      } catch (error) {
        this.logger.error(
          `  → FAILED: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Record a failed entry with minimum scores
        results.push({
          question: entry.question,
          generatedAnswer: `[ERROR] ${error instanceof Error ? error.message : String(error)}`,
          expectedAnswer: entry.expectedAnswer,
          faithfulnessScore: 1,
          retrievalScore: 1,
          citedSources: [],
          expectedSources: entry.expectedSources,
        });
      }
    }

    const summary = this.aggregate(results);
    this.logger.log(
      `Evaluation complete: avgRetrieval=${summary.avgRetrieval.toFixed(2)}, avgFaithfulness=${summary.avgFaithfulness.toFixed(2)}`,
    );
    return summary;
  }

  /**
   * Evaluate a single dataset entry.
   */
  private async evaluateEntry(
    entry: GoldenDatasetEntry,
    provider?: string,
  ): Promise<EvalResult> {
    // 1. Call the RAG pipeline
    const ragResponse: RagQueryResponse = await this.queryService.query({
      question: entry.question,
      ...(provider ? { model_choice: provider } : {}),
    });

    // 2. Build context string from retrieved chunks
    const retrievedContext =
      ragResponse.retrievedChunks
        ?.map(
          (c, i) =>
            `[Chunk ${i + 1} | ${c.source}] ${c.text.slice(0, 300)}`,
        )
        .join("\n\n") ?? "";

    const citedSources = ragResponse.citations.map((c) => c.source);

    // 3. Call the LLM judge
    const scores = await this.judgeService.score({
      question: entry.question,
      expectedAnswer: entry.expectedAnswer,
      generatedAnswer: ragResponse.answer,
      retrievedContext,
      expectedSources: entry.expectedSources,
      citedSources,
    });

    return {
      question: entry.question,
      generatedAnswer: ragResponse.answer,
      expectedAnswer: entry.expectedAnswer,
      faithfulnessScore: scores.faithfulnessScore,
      retrievalScore: scores.retrievalScore,
      citedSources,
      expectedSources: entry.expectedSources,
    };
  }

  /**
   * Aggregate individual results into a summary.
   */
  private aggregate(results: EvalResult[]): EvalSummary {
    const total = results.length;
    const avgFaithfulness =
      total > 0
        ? results.reduce((sum, r) => sum + r.faithfulnessScore, 0) / total
        : 0;
    const avgRetrieval =
      total > 0
        ? results.reduce((sum, r) => sum + r.retrievalScore, 0) / total
        : 0;

    return {
      totalQuestions: total,
      avgFaithfulness: Math.round(avgFaithfulness * 100) / 100,
      avgRetrieval: Math.round(avgRetrieval * 100) / 100,
      results,
    };
  }
}

