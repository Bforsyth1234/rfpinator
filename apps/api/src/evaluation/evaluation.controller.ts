import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Res,
  Sse,
  MessageEvent,
  Query,
} from "@nestjs/common";
import type { Response } from "express";
import { Observable } from "rxjs";
import type { GoldenDatasetEntry, SavedEvalRun, SavedEvalRunListItem } from "@rfpinator/shared";
import { EvaluationService } from "./evaluation.service";
import { RAG_SYSTEM_PROMPT } from "../query/query.service";
import { JUDGE_SYSTEM_PROMPT } from "./judge.service";
import * as path from "path";

interface RunEvalRequest {
  provider?: string;
  datasetPath?: string;
}

const DEFAULT_DATASET_PATH = path.resolve(
  __dirname,
  "../../../../data/golden_dataset.json",
);

@Controller("evaluation")
export class EvaluationController {
  private readonly logger = new Logger(EvaluationController.name);

  constructor(private readonly evaluationService: EvaluationService) {}

  /**
   * GET /evaluation/dataset
   * Return the default golden dataset entries.
   */
  @Get("dataset")
  getDataset(): { entries: GoldenDatasetEntry[] } {
    const entries = this.evaluationService.loadDataset(DEFAULT_DATASET_PATH);
    return { entries };
  }

  /**
   * POST /evaluation/dataset
   * Add a new entry to the golden dataset.
   */
  @Post("dataset")
  @HttpCode(HttpStatus.CREATED)
  addEntry(@Body() body: GoldenDatasetEntry): { entries: GoldenDatasetEntry[] } {
    this.logger.log(`Adding golden dataset entry: "${body.question.slice(0, 60)}"`);
    const entries = this.evaluationService.loadDataset(DEFAULT_DATASET_PATH);
    entries.push(body);
    this.evaluationService.saveDataset(DEFAULT_DATASET_PATH, entries);
    return { entries };
  }

  /**
   * PUT /evaluation/dataset/:index
   * Update a golden dataset entry by index.
   */
  @Put("dataset/:index")
  updateEntry(
    @Param("index") index: string,
    @Body() body: GoldenDatasetEntry,
  ): { entries: GoldenDatasetEntry[] } {
    const idx = parseInt(index, 10);
    const entries = this.evaluationService.loadDataset(DEFAULT_DATASET_PATH);
    if (idx < 0 || idx >= entries.length) {
      throw new Error(`Index ${idx} out of bounds (0..${entries.length - 1})`);
    }
    this.logger.log(`Updating golden dataset entry ${idx}`);
    entries[idx] = body;
    this.evaluationService.saveDataset(DEFAULT_DATASET_PATH, entries);
    return { entries };
  }

  /**
   * DELETE /evaluation/dataset/:index
   * Delete a golden dataset entry by index.
   */
  @Delete("dataset/:index")
  deleteEntry(@Param("index") index: string): { entries: GoldenDatasetEntry[] } {
    const idx = parseInt(index, 10);
    const entries = this.evaluationService.loadDataset(DEFAULT_DATASET_PATH);
    if (idx < 0 || idx >= entries.length) {
      throw new Error(`Index ${idx} out of bounds (0..${entries.length - 1})`);
    }
    this.logger.log(`Deleting golden dataset entry ${idx}`);
    entries.splice(idx, 1);
    this.evaluationService.saveDataset(DEFAULT_DATASET_PATH, entries);
    return { entries };
  }

  /**
   * GET /evaluation/prompts
   * Return the default RAG and Judge system prompts so the frontend can pre-populate editors.
   */
  @Get("prompts")
  getPrompts(): { ragSystemPrompt: string; judgeSystemPrompt: string } {
    return {
      ragSystemPrompt: RAG_SYSTEM_PROMPT,
      judgeSystemPrompt: JUDGE_SYSTEM_PROMPT,
    };
  }

  /**
   * POST /evaluation/run/stream
   * SSE endpoint: streams per-question EvalResult events, then a final summary event.
   * Uses POST so custom prompts can be sent in the body (avoids URL length limits).
   * Manually writes SSE frames because NestJS @Sse only supports GET.
   */
  @Post("run/stream")
  @HttpCode(HttpStatus.OK)
  async streamEvaluation(
    @Body() body: { provider?: string; ragSystemPrompt?: string; judgeSystemPrompt?: string },
    @Res() res: Response,
  ): Promise<void> {
    const provider = body?.provider;
    const ragSystemPrompt = body?.ragSystemPrompt;
    const judgeSystemPrompt = body?.judgeSystemPrompt;
    const datasetPath = DEFAULT_DATASET_PATH;

    this.logger.log(
      `SSE evaluation stream requested: provider=${provider ?? "default"}, dataset=${datasetPath}, customRagPrompt=${!!ragSystemPrompt}, customJudgePrompt=${!!judgeSystemPrompt}`,
    );

    // Set SSE headers manually
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const dataset = this.evaluationService.loadDataset(datasetPath);
    const results: import("@rfpinator/shared").EvalResult[] = [];

    try {
      for await (const result of this.evaluationService.evaluateStream(dataset, { provider, ragSystemPrompt, judgeSystemPrompt })) {
        results.push(result);
        const payload = JSON.stringify({ type: "result", index: results.length - 1, total: dataset.length, result });
        res.write(`data: ${payload}\n\n`);
      }

      // Aggregate + persist
      const summary = this.evaluationService.aggregate(results);
      const prov = provider ?? "groq";
      const savedRun = this.evaluationService.saveRun(summary, prov);
      this.logger.log(`SSE eval run persisted as ${savedRun.id}`);

      const summaryPayload = JSON.stringify({ type: "summary", summary, runId: savedRun.id });
      res.write(`data: ${summaryPayload}\n\n`);
    } catch (err) {
      this.logger.error(`SSE stream error: ${err instanceof Error ? err.message : String(err)}`);
      const errorPayload = JSON.stringify({ type: "error", message: err instanceof Error ? err.message : String(err) });
      res.write(`data: ${errorPayload}\n\n`);
    } finally {
      res.end();
    }
  }

  // ── Eval Run CRUD ────────────────────────────────

  /**
   * GET /evaluation/runs
   * List all saved evaluation runs (lightweight).
   */
  @Get("runs")
  listRuns(): { runs: SavedEvalRunListItem[] } {
    return { runs: this.evaluationService.listRuns() };
  }

  /**
   * GET /evaluation/runs/:id
   * Get a single saved evaluation run with full details.
   */
  @Get("runs/:id")
  getRun(@Param("id") id: string): SavedEvalRun {
    const run = this.evaluationService.getRun(id);
    if (!run) {
      throw new Error(`Eval run not found: ${id}`);
    }
    return run;
  }

  /**
   * DELETE /evaluation/runs/:id
   * Delete a saved evaluation run.
   */
  @Delete("runs/:id")
  deleteRun(@Param("id") id: string): { success: boolean } {
    const deleted = this.evaluationService.deleteRun(id);
    if (!deleted) {
      throw new Error(`Eval run not found: ${id}`);
    }
    return { success: true };
  }
}

