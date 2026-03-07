"use client";

import { useCallback, useEffect, useState } from "react";
import type { QuestionnaireRow } from "@rfpinator/shared";
import { fetchProviders } from "@/lib/api-client";
import { Sidebar, type View } from "./Sidebar";
import { UploadView } from "./UploadView";
import { ResultsView } from "./ResultsView";

export function Dashboard() {
  const [view, setView] = useState<View>("upload");
  const [selectedModel, setSelectedModel] = useState("groq");
  const [providers, setProviders] = useState<string[]>([]);
  const [rows, setRows] = useState<QuestionnaireRow[]>([]);

  // Fetch available providers on mount
  useEffect(() => {
    fetchProviders()
      .then(setProviders)
      .catch(() => setProviders(["groq", "openai"])); // fallback
  }, []);

  const handleRowsGenerated = useCallback(
    (newRows: QuestionnaireRow[]) => {
      setRows(newRows);
      setView("results");
    },
    [],
  );

  const handleUpdateRow = useCallback(
    (id: string, updates: Partial<QuestionnaireRow>) => {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updates } : r)),
      );
    },
    [],
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
            onRowsGenerated={handleRowsGenerated}
          />
        )}
        {view === "results" && (
          <ResultsView rows={rows} onUpdateRow={handleUpdateRow} />
        )}
      </main>
    </div>
  );
}

