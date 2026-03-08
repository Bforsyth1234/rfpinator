import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import type {
  GoldenDatasetEntry,
  EvalResult,
  EvalSummary,
  RagQueryResponse,
  SavedEvalRun,
  SavedEvalRunListItem,
} from "@rfpinator/shared";
import { QueryService, RAG_SYSTEM_PROMPT } from "../query/query.service";
import { JudgeService } from "./judge.service";

const EVAL_RUNS_DIR = path.resolve(__dirname, "../../../../data/eval_runs");

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
    for await (const result of this.evaluateStream(dataset, options)) {
      results.push(result);
    }

    const summary = this.aggregate(results);
    this.logger.log(
      `Evaluation complete: avgRetrieval=${summary.avgRetrieval.toFixed(2)}, avgFaithfulness=${summary.avgFaithfulness.toFixed(2)}`,
    );

    // Auto-persist the run
    const provider = options?.provider ?? "groq";
    const savedRun = this.saveRun(summary, provider);
    this.logger.log(`Eval run persisted as ${savedRun.id}`);

    return summary;
  }

  /**
   * Streaming evaluation: yields one EvalResult per question as it completes.
   */
  async *evaluateStream(
    dataset: GoldenDatasetEntry[],
    options?: { provider?: string },
  ): AsyncGenerator<EvalResult> {
    for (let i = 0; i < dataset.length; i++) {
      const entry = dataset[i];
      this.logger.log(
        `Evaluating [${i + 1}/${dataset.length}]: "${entry.question.slice(0, 60)}..."`,
      );

      try {
        const result = await this.evaluateEntry(entry, options?.provider);
        this.logger.log(
          `  → retrieval=${result.retrievalScore}/5, faithfulness=${result.faithfulnessScore}/5`,
        );
        yield result;
      } catch (error) {
        this.logger.error(
          `  → FAILED: ${error instanceof Error ? error.message : String(error)}`,
        );
        yield {
          question: entry.question,
          generatedAnswer: `[ERROR] ${error instanceof Error ? error.message : String(error)}`,
          expectedAnswer: entry.expectedAnswer,
          faithfulnessScore: 1,
          retrievalScore: 1,
          citedSources: [],
          expectedSources: entry.expectedSources,
        };
      }
    }
  }

  /**
   * Save a golden dataset to a JSON file.
   */
  saveDataset(filePath: string, entries: GoldenDatasetEntry[]): void {
    const resolved = path.resolve(filePath);
    fs.writeFileSync(resolved, JSON.stringify(entries, null, 2) + "\n", "utf-8");
    this.logger.log(`Saved ${entries.length} entries to ${resolved}`);
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

    // 3. Reconstruct the RAG user message (same format as QueryService)
    const ragUserMessage = `Context chunks:\n${retrievedContext}\n\nQuestion: ${entry.question}`;

    // 4. Call the LLM judge (now returns prompts too)
    const judgeResult = await this.judgeService.score({
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
      faithfulnessScore: judgeResult.faithfulnessScore,
      retrievalScore: judgeResult.retrievalScore,
      citedSources,
      expectedSources: entry.expectedSources,
      prompts: {
        ragSystemPrompt: RAG_SYSTEM_PROMPT,
        ragUserMessage,
        judgeSystemPrompt: judgeResult.judgeSystemPrompt,
        judgeUserMessage: judgeResult.judgeUserMessage,
      },
    };
  }

  /**
   * Aggregate individual results into a summary.
   */
  aggregate(results: EvalResult[]): EvalSummary {
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

  // ── Eval Run Persistence ────────────────────────────────

  private ensureRunsDir(): void {
    if (!fs.existsSync(EVAL_RUNS_DIR)) {
      fs.mkdirSync(EVAL_RUNS_DIR, { recursive: true });
    }
  }

  /**
   * Save an evaluation run to disk and return the saved run object.
   */
  saveRun(summary: EvalSummary, provider: string): SavedEvalRun {
    this.ensureRunsDir();
    const run: SavedEvalRun = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      provider,
      summary,
    };
    const filePath = path.join(EVAL_RUNS_DIR, `${run.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(run, null, 2));
    this.logger.log(`Saved eval run ${run.id}`);
    return run;
  }

  /**
   * List all saved evaluation runs (lightweight, no per-question results).
   */
  listRuns(): SavedEvalRunListItem[] {
    this.ensureRunsDir();
    const files = fs.readdirSync(EVAL_RUNS_DIR).filter((f) => f.endsWith(".json"));
    const items: SavedEvalRunListItem[] = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(EVAL_RUNS_DIR, file), "utf-8");
        const run: SavedEvalRun = JSON.parse(raw);
        items.push({
          id: run.id,
          createdAt: run.createdAt,
          provider: run.provider,
          totalQuestions: run.summary.totalQuestions,
          avgFaithfulness: run.summary.avgFaithfulness,
          avgRetrieval: run.summary.avgRetrieval,
        });
      } catch {
        this.logger.warn(`Skipping corrupt eval run file: ${file}`);
      }
    }
    // Sort newest first
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  }

  /**
   * Get a single saved evaluation run by ID.
   */
  getRun(id: string): SavedEvalRun | null {
    const filePath = path.join(EVAL_RUNS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  }

  /**
   * Delete a saved evaluation run by ID.
   */
  deleteRun(id: string): boolean {
    const filePath = path.join(EVAL_RUNS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    this.logger.log(`Deleted eval run ${id}`);
    return true;
  }
}

