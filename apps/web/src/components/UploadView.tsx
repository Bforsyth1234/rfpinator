"use client";

import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { QuestionnaireRow } from "@rfpinator/shared";
import { uploadFiles, submitQuery } from "@/lib/api-client";

interface UploadViewProps {
  selectedModel: string;
  onRowsGenerated: (rows: QuestionnaireRow[]) => void;
}

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";

export function UploadView({
  selectedModel,
  onRowsGenerated,
}: UploadViewProps) {
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [questionnaireFile, setQuestionnaireFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
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

  const parseCsvQuestions = (text: string): string[] => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];
    // If first line looks like a header, skip it
    const first = lines[0].toLowerCase();
    const start =
      first.includes("question") || first.includes("prompt") ? 1 : 0;
    return lines.slice(start).map((l) => {
      // Strip surrounding quotes and take first CSV column
      const col = l.split(",")[0].replace(/^"|"$/g, "").trim();
      return col;
    });
  };

  const parseQuestionnaire = async (file: File): Promise<string[]> => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });
      if (rows.length === 0) return [];
      // Use the first column (by key order) as the question column,
      // or a column named "question"/"prompt" if present
      const keys = Object.keys(rows[0]);
      const qKey =
        keys.find((k) => /question|prompt/i.test(k)) ?? keys[0];
      return rows
        .map((r) => String(r[qKey] ?? "").trim())
        .filter(Boolean);
    }

    // Default: CSV / plain text
    const text = await file.text();
    return parseCsvQuestions(text);
  };

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
      setProgress("Parsing questionnaire…");
      const questions = await parseQuestionnaire(questionnaireFile);
      if (questions.length === 0) {
        throw new Error("No questions found in the questionnaire file.");
      }

      // Step 3: Query each question
      const rows: QuestionnaireRow[] = [];
      for (let i = 0; i < questions.length; i++) {
        setProgress(
          `Answering question ${i + 1} of ${questions.length}…`,
        );
        const resp = await submitQuery({
          question: questions[i],
          model_choice: selectedModel,
        });
        rows.push({
          id: `q-${i}`,
          question: questions[i],
          answer: resp.answer,
          citations: resp.citations,
          confidenceScore: resp.confidenceScore,
          status: "pending",
        });
      }

      setStatus("done");
      setProgress("");
      onRowsGenerated(rows);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
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
