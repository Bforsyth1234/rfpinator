"use client";

import { useCallback, useRef, useState } from "react";
import type { QuestionnaireRow } from "@rfpinator/shared";
import { uploadFiles, submitQuery } from "@/lib/api-client";
import {
  parseQuestionnaireFile,
  type QuestionnaireExportTemplate,
} from "@/lib/questionnaire-export";

interface UploadViewProps {
  selectedModel: string;
  onStreamStart: (exportTemplate: QuestionnaireExportTemplate, totalQuestions: number) => void;
  onRowResult: (row: QuestionnaireRow) => void;
  onRowError: () => void;
  onStreamEnd: () => void;
}

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";

export function UploadView({
  selectedModel,
  onStreamStart,
  onRowResult,
  onRowError,
  onStreamEnd,
}: UploadViewProps) {
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [questionnaireFile, setQuestionnaireFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [batchSize, setBatchSize] = useState(50);
  const sourceRef = useRef<HTMLInputElement>(null);
  const questionnaireRef = useRef<HTMLInputElement>(null);

  const handleSourceSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) setSourceFiles(Array.from(e.target.files));
    },
    [],
  );

  const handleQuestionnaireSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) setQuestionnaireFile(e.target.files[0]);
    },
    [],
  );

  const handleSubmit = async () => {
    if (sourceFiles.length === 0 || !questionnaireFile) return;
    setError(null);
    try {
      // Step 1: Upload source documents
      setStatus("uploading");
      setProgress("Uploading source documents…");
      await uploadFiles(sourceFiles);

      // Step 2: Parse questionnaire
      setStatus("processing");
      setProgress("Detecting questionnaire columns…");
      const parsedQuestionnaire = await parseQuestionnaireFile(
        questionnaireFile,
        selectedModel,
      );
      const questions = parsedQuestionnaire.questions;
      if (questions.length === 0) {
        throw new Error("No questions found in the questionnaire file.");
      }

      // Step 3: Stream answers — switch to results view immediately
      const BATCH_SIZE = batchSize;
      const validQuestions = questions
        .map((q, idx) => ({ ...q, originalIndex: idx }))
        .filter((q) => q.question.trim().length > 0);

      onStreamStart(parsedQuestionnaire.exportTemplate, validQuestions.length);

      for (let batchStart = 0; batchStart < validQuestions.length; batchStart += BATCH_SIZE) {
        const batch = validQuestions.slice(batchStart, batchStart + BATCH_SIZE);
        const batchEnd = Math.min(batchStart + BATCH_SIZE, validQuestions.length);
        setProgress(
          `Answering questions ${batchStart + 1}–${batchEnd} of ${validQuestions.length}…`,
        );

        await Promise.all(
          batch.map(async (entry) => {
            const question = entry.question.trim();
            try {
              const resp = await submitQuery({
                question,
                model_choice: selectedModel,
              });
              onRowResult({
                id: entry.id,
                question,
                answer: resp.answer,
                citations: resp.citations,
                confidenceScore: resp.confidenceScore,
                status: "pending",
                location: entry.location,
                answerable: resp.answerable,
              });
            } catch {
              onRowResult({
                id: entry.id,
                question,
                status: "error",
                location: entry.location,
                answer: "⚠️ Failed to generate answer",
              });
              onRowError();
            }
          }),
        );
      }

      setStatus("done");
      setProgress("");
      onStreamEnd();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
      onStreamEnd();
    }
  };

  const isReady =
    sourceFiles.length > 0 &&
    questionnaireFile !== null &&
    status !== "uploading" &&
    status !== "processing";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload Documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload your source-of-truth policy documents and a questionnaire file
          to generate answers.
        </p>
      </div>

      {/* Source Documents */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800">
          Source Documents
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload PDF or Markdown policy documents that will be used as the
          knowledge base.
        </p>
        <div className="mt-4">
          <input
            ref={sourceRef}
            type="file"
            multiple
            accept=".pdf,.md,.txt"
            onChange={handleSourceSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => sourceRef.current?.click()}
            className="btn-secondary"
          >
            Select Files
          </button>
          {sourceFiles.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-gray-600">
              {sourceFiles.map((f) => (
                <li key={f.name}>📄 {f.name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Questionnaire */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800">Questionnaire</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload a CSV or Excel file containing the questions to answer.
        </p>
        <div className="mt-4">
          <input
            ref={questionnaireRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleQuestionnaireSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => questionnaireRef.current?.click()}
            className="btn-secondary"
          >
            Select Questionnaire
          </button>
          {questionnaireFile && (
            <p className="mt-3 text-sm text-gray-600">
              📋 {questionnaireFile.name}
            </p>
          )}
        </div>
      </div>

      {/* Concurrency */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800">Concurrency</h2>
        <p className="mt-1 text-sm text-gray-500">
          Number of questions answered in parallel per batch. Higher values are
          faster but may hit API rate limits.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
            className="h-2 w-48 cursor-pointer accent-brand-primary"
          />
          <span className="min-w-[3rem] text-sm font-medium text-gray-700">
            {batchSize}
          </span>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={!isReady}
          onClick={handleSubmit}
          className="btn-primary"
        >
          {status === "uploading" || status === "processing"
            ? "Processing…"
            : "Generate Answers"}
        </button>
        {progress && (
          <span className="text-sm text-gray-500">{progress}</span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
