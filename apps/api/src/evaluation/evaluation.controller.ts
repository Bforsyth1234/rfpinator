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
  Sse,
  MessageEvent,
  Query,
} from "@nestjs/common";
import { Observable } from "rxjs";
import type { GoldenDatasetEntry, SavedEvalRun, SavedEvalRunListItem } from "@rfpinator/shared";
import { EvaluationService } from "./evaluation.service";
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
   * GET /evaluation/run/stream?provider=xxx
   * SSE endpoint: streams per-question EvalResult events, then a final summary event.
   */
  @Sse("run/stream")
  streamEvaluation(
    @Query("provider") provider?: string,
  ): Observable<MessageEvent> {
    const datasetPath = DEFAULT_DATASET_PATH;

    this.logger.log(
      `SSE evaluation stream requested: provider=${provider ?? "default"}, dataset=${datasetPath}`,
    );

    const dataset = this.evaluationService.loadDataset(datasetPath);
    const evalService = this.evaluationService;
    const logger = this.logger;

    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        const results: import("@rfpinator/shared").EvalResult[] = [];
        try {
          for await (const result of evalService.evaluateStream(dataset, { provider })) {
            results.push(result);
            subscriber.next({
              data: JSON.stringify({ type: "result", index: results.length - 1, total: dataset.length, result }),
            } as MessageEvent);
          }

          // Aggregate + persist
          const summary = evalService.aggregate(results);
          const prov = provider ?? "groq";
          const savedRun = evalService.saveRun(summary, prov);
          logger.log(`SSE eval run persisted as ${savedRun.id}`);

          subscriber.next({
            data: JSON.stringify({ type: "summary", summary, runId: savedRun.id }),
          } as MessageEvent);
        } catch (err) {
          logger.error(`SSE stream error: ${err instanceof Error ? err.message : String(err)}`);
          subscriber.next({
            data: JSON.stringify({ type: "error", message: err instanceof Error ? err.message : String(err) }),
          } as MessageEvent);
        } finally {
          subscriber.complete();
        }
      })();
    });
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

