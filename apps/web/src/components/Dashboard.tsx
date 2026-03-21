"use client";

import { useCallback, useEffect, useState } from "react";
import type { QuestionnaireRow } from "@rfpinator/shared";
import { fetchProviders, submitQuery } from "@/lib/api-client";
import type { QuestionnaireExportTemplate } from "@/lib/questionnaire-export";
import { Sidebar, type View } from "./Sidebar";
import { UploadView } from "./UploadView";
import { ResultsView } from "./ResultsView";
import { DocumentsView } from "./DocumentsView";
import { EvaluationView } from "./EvaluationView";

export interface StreamProgress {
  completed: number;
  total: number;
  failed: number;
}

export function Dashboard() {
  const [view, setView] = useState<View>("upload");
  const [selectedModel, setSelectedModel] = useState("groq");
  const [providers, setProviders] = useState<string[]>([]);
  const [rows, setRows] = useState<QuestionnaireRow[]>([]);
  const [exportTemplate, setExportTemplate] =
    useState<QuestionnaireExportTemplate | null>(null);
  const [streamProgress, setStreamProgress] = useState<StreamProgress | null>(null);

  // Fetch available providers on mount
  useEffect(() => {
    fetchProviders()
      .then(setProviders)
      .catch(() => setProviders(["groq", "openai"])); // fallback
  }, []);

  /** Called once when processing starts — clears old results and switches to results view */
  const handleStreamStart = useCallback(
    (nextExportTemplate: QuestionnaireExportTemplate, totalQuestions: number) => {
      setRows([]);
      setExportTemplate(nextExportTemplate);
      setStreamProgress({ completed: 0, total: totalQuestions, failed: 0 });
      setView("results");
    },
    [],
  );

  /** Called for each completed row — appends to the results list */
  const handleRowResult = useCallback((row: QuestionnaireRow) => {
    setRows((prev) => [...prev, row]);
    setStreamProgress((prev) =>
      prev ? { ...prev, completed: prev.completed + 1 } : prev,
    );
  }, []);

  /** Called when a single question fails */
  const handleRowError = useCallback(() => {
    setStreamProgress((prev) =>
      prev
        ? { ...prev, completed: prev.completed + 1, failed: prev.failed + 1 }
        : prev,
    );
  }, []);

  /** Called when processing finishes */
  const handleStreamEnd = useCallback(() => {
    setStreamProgress(null);
  }, []);

  const handleUpdateRow = useCallback(
    (id: string, updates: Partial<QuestionnaireRow>) => {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updates } : r)),
      );
    },
    [],
  );

  const handleRemoveRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleRetryRow = useCallback(
    async (id: string) => {
      const row = rows.find((r) => r.id === id);
      if (!row) return;
      // Mark as pending while retrying
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status: "pending" as const, answer: "Retrying…" } : r,
        ),
      );
      try {
        const resp = await submitQuery({
          question: row.question,
          model_choice: selectedModel,
        });
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  answer: resp.answer,
                  citations: resp.citations,
                  confidenceScore: resp.confidenceScore,
                  status: "pending" as const,
                  answerable: resp.answerable,
                }
              : r,
          ),
        );
      } catch {
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, status: "error" as const, answer: "⚠️ Retry failed" }
              : r,
          ),
        );
      }
    },
    [rows, selectedModel],
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        currentView={view}
        onNavigate={setView}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        providers={providers}
      />

      <main className="flex-1 overflow-y-auto bg-surface-muted p-8">
        {view === "upload" && (
          <UploadView
            selectedModel={selectedModel}
            onStreamStart={handleStreamStart}
            onRowResult={handleRowResult}
            onRowError={handleRowError}
            onStreamEnd={handleStreamEnd}
          />
        )}
        {view === "results" && (
          <ResultsView
            rows={rows}
            exportTemplate={exportTemplate}
            onUpdateRow={handleUpdateRow}
            onRemoveRow={handleRemoveRow}
            onRetryRow={handleRetryRow}
            streamProgress={streamProgress}
          />
        )}
        {view === "documents" && <DocumentsView />}
        {view === "evaluation" && (
          <EvaluationView selectedModel={selectedModel} />
        )}
      </main>
    </div>
  );
}

