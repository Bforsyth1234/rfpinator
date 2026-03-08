#!/usr/bin/env node
/**
 * RFPinator Evaluation CLI
 *
 * Usage:
 *   pnpm evaluate [path/to/golden_dataset.json] [--provider groq|openai] [--json]
 *
 * Defaults:
 *   dataset: data/golden_dataset.json (relative to repo root)
 *   provider: (uses backend default)
 *   output: human-readable CLI table (add --json for JSON output)
 */
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { EvaluationService } from "../evaluation/evaluation.service";
import type { EvalSummary } from "@rfpinator/shared";
import * as path from "path";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const providerIdx = args.indexOf("--provider");
  const provider =
    providerIdx !== -1 && args[providerIdx + 1]
      ? args[providerIdx + 1]
      : undefined;

  // Find dataset path (first non-flag argument)
  const rawPath =
    args.find((a) => !a.startsWith("--") && a !== provider) ??
    "data/golden_dataset.json";

  // Resolve relative to repo root (two levels up from apps/api)
  const repoRoot = path.resolve(__dirname, "../../../..");
  const datasetPath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(repoRoot, rawPath);

  // Bootstrap NestJS in standalone mode (no HTTP listener)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: jsonOutput ? false : ["log", "warn", "error"],
  });

  const evalService = app.get(EvaluationService);

  try {
    const dataset = evalService.loadDataset(datasetPath);
    const summary = await evalService.evaluate(dataset, { provider });

    if (jsonOutput) {
      process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    } else {
      printReport(summary);
    }
  } catch (error) {
    console.error(
      "Evaluation failed:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

function printReport(summary: EvalSummary): void {
  console.log("\n" + "=".repeat(70));
  console.log("  RFPinator Evaluation Report");
  console.log("=".repeat(70));
  console.log(`  Total Questions:       ${summary.totalQuestions}`);
  console.log(`  Avg Retrieval Score:   ${summary.avgRetrieval.toFixed(2)} / 5`);
  console.log(
    `  Avg Faithfulness Score: ${summary.avgFaithfulness.toFixed(2)} / 5`,
  );
  console.log("-".repeat(70));

  for (const r of summary.results) {
    console.log(`\n  Q: ${r.question}`);
    console.log(`  Retrieval: ${r.retrievalScore}/5  |  Faithfulness: ${r.faithfulnessScore}/5`);
    console.log(`  Expected sources: ${r.expectedSources.join(", ")}`);
    console.log(`  Cited sources:    ${r.citedSources.join(", ") || "(none)"}`);
    console.log(
      `  Answer: ${r.generatedAnswer.slice(0, 120)}${r.generatedAnswer.length > 120 ? "..." : ""}`,
    );
  }

  console.log("\n" + "=".repeat(70) + "\n");
}

main();

