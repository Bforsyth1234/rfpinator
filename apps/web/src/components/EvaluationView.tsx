"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { EvalSummary, EvalResult, GoldenDatasetEntry, SavedEvalRunListItem, SavedEvalRun } from "@rfpinator/shared";
import {
  fetchGoldenDataset,
  streamEvaluation,
  addGoldenDatasetEntry,
  updateGoldenDatasetEntry,
  deleteGoldenDatasetEntry,
  fetchEvalRuns,
  fetchEvalRun,
  deleteEvalRun,
  fetchPrompts,
} from "@/lib/api-client";

interface EvaluationViewProps {
  selectedModel: string;
}

type EvalStatus = "idle" | "loading-dataset" | "running" | "done" | "error";

export function EvaluationView({ selectedModel }: EvaluationViewProps) {
  const [dataset, setDataset] = useState<GoldenDatasetEntry[]>([]);
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [status, setStatus] = useState<EvalStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<GoldenDatasetEntry>({
    question: "",
    expectedAnswer: "",
    expectedSources: [],
  });

  // Streaming state
  const [streamingResults, setStreamingResults] = useState<EvalResult[]>([]);
  const [streamProgress, setStreamProgress] = useState<{ current: number; total: number } | null>(null);

  // Prompt editor state
  const [ragPrompt, setRagPrompt] = useState<string>("");
  const [judgePrompt, setJudgePrompt] = useState<string>("");
  const [defaultRagPrompt, setDefaultRagPrompt] = useState<string>("");
  const [defaultJudgePrompt, setDefaultJudgePrompt] = useState<string>("");
  const [showPromptEditors, setShowPromptEditors] = useState(false);

  // History state
  const [runs, setRuns] = useState<SavedEvalRunListItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<SavedEvalRun | null>(null);
  const [historyExpandedRow, setHistoryExpandedRow] = useState<number | null>(null);
  const [historyExpandedPrompts, setHistoryExpandedPrompts] = useState<number | null>(null);

  // Load golden dataset + eval run history on mount
  const loadRuns = useCallback(() => {
    fetchEvalRuns().then(setRuns).catch(() => {});
  }, []);

  useEffect(() => {
    setStatus("loading-dataset");
    fetchGoldenDataset()
      .then((entries) => {
        setDataset(entries);
        setStatus("idle");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load dataset");
        setStatus("error");
      });
    loadRuns();
    // Load default prompts
    fetchPrompts()
      .then(({ ragSystemPrompt, judgeSystemPrompt }) => {
        setRagPrompt(ragSystemPrompt);
        setJudgePrompt(judgeSystemPrompt);
        setDefaultRagPrompt(ragSystemPrompt);
        setDefaultJudgePrompt(judgeSystemPrompt);
      })
      .catch(() => {}); // non-critical
  }, [loadRuns]);

  const handleRun = useCallback(async () => {
    setError(null);
    setSummary(null);
    setStreamingResults([]);
    setStreamProgress(null);
    setExpandedRow(null);
    setExpandedPrompts(null);
    setStatus("running");
    try {
      const finalSummary = await streamEvaluation({
        provider: selectedModel,
        ragSystemPrompt: ragPrompt !== defaultRagPrompt ? ragPrompt : undefined,
        judgeSystemPrompt: judgePrompt !== defaultJudgePrompt ? judgePrompt : undefined,
        onResult: (result, index, total) => {
          setStreamingResults((prev) => [...prev, result]);
          setStreamProgress({ current: index + 1, total });
        },
      });
      setSummary(finalSummary);
      setStreamingResults([]);
      setStreamProgress(null);
      setStatus("done");
      loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
      setStatus("error");
      // Keep partial results visible — they're already in streamingResults
    }
  }, [selectedModel, loadRuns]);

  const handleViewRun = useCallback(async (id: string) => {
    try {
      const run = await fetchEvalRun(id);
      setSelectedRun(run);
      setHistoryExpandedRow(null);
      setHistoryExpandedPrompts(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run");
    }
  }, []);

  const handleDeleteRun = useCallback(async (id: string) => {
    if (!confirm("Delete this evaluation run?")) return;
    try {
      await deleteEvalRun(id);
      setRuns((prev) => prev.filter((r) => r.id !== id));
      if (selectedRun?.id === id) setSelectedRun(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete run");
    }
  }, [selectedRun]);

  const resetForm = () => {
    setFormData({ question: "", expectedAnswer: "", expectedSources: [] });
    setEditingIndex(null);
    setShowAddForm(false);
  };

  const handleAdd = useCallback(async () => {
    if (!formData.question.trim() || !formData.expectedAnswer.trim()) return;
    try {
      const entries = await addGoldenDatasetEntry(formData);
      setDataset(entries);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry");
    }
  }, [formData]);

  const handleUpdate = useCallback(async () => {
    if (editingIndex === null) return;
    try {
      const entries = await updateGoldenDatasetEntry(editingIndex, formData);
      setDataset(entries);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update entry");
    }
  }, [editingIndex, formData]);

  const handleDelete = useCallback(async (index: number) => {
    if (!confirm("Delete this golden dataset entry?")) return;
    try {
      const entries = await deleteGoldenDatasetEntry(index);
      setDataset(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry");
    }
  }, []);

  const startEdit = (index: number) => {
    const entry = dataset[index];
    setFormData({ ...entry });
    setEditingIndex(index);
    setShowAddForm(true);
  };

  const scoreColor = (score: number) => {
    if (score >= 4) return "text-green-700 bg-green-50";
    if (score >= 3) return "text-yellow-700 bg-yellow-50";
    return "text-red-700 bg-red-50";
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evaluation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Run the RAG pipeline against a golden dataset and score with GPT-4.1 judge.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={status === "running" || dataset.length === 0}
          className="btn-primary"
        >
          {status === "running" ? "Running…" : "Run Evaluation"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Prompt Editors */}
      <div className="card">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setShowPromptEditors((v) => !v)}
        >
          <h2 className="text-lg font-semibold text-gray-800">
            Prompt Engineering
          </h2>
          <span className="text-sm text-gray-500">
            {showPromptEditors ? "▼ Collapse" : "▶ Expand"}
          </span>
        </button>
        {showPromptEditors && (
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label">RAG System Prompt</label>
                {ragPrompt !== defaultRagPrompt && (
                  <button
                    type="button"
                    onClick={() => setRagPrompt(defaultRagPrompt)}
                    className="text-xs text-accent-600 hover:text-accent-700"
                  >
                    Reset to Default
                  </button>
                )}
              </div>
              <textarea
                className="input mt-1 font-mono text-xs"
                rows={10}
                value={ragPrompt}
                onChange={(e) => setRagPrompt(e.target.value)}
                placeholder="Loading default RAG prompt…"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label">Judge System Prompt</label>
                {judgePrompt !== defaultJudgePrompt && (
                  <button
                    type="button"
                    onClick={() => setJudgePrompt(defaultJudgePrompt)}
                    className="text-xs text-accent-600 hover:text-accent-700"
                  >
                    Reset to Default
                  </button>
                )}
              </div>
              <textarea
                className="input mt-1 font-mono text-xs"
                rows={10}
                value={judgePrompt}
                onChange={(e) => setJudgePrompt(e.target.value)}
                placeholder="Loading default Judge prompt…"
              />
            </div>
            {(ragPrompt !== defaultRagPrompt || judgePrompt !== defaultJudgePrompt) && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                ⚠️ Custom prompts will be used for the next evaluation run.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Golden Dataset */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            Golden Dataset ({dataset.length} entries)
          </h2>
          <button
            type="button"
            onClick={() => { resetForm(); setShowAddForm(true); }}
            className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
          >
            + Add Entry
          </button>
        </div>

        {/* Add / Edit form */}
        {showAddForm && (
          <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div>
              <label className="label">Question</label>
              <input
                className="input mt-1"
                value={formData.question}
                onChange={(e) => setFormData((f) => ({ ...f, question: e.target.value }))}
                placeholder="Enter the evaluation question…"
              />
            </div>
            <div>
              <label className="label">Expected Answer</label>
              <textarea
                className="input mt-1"
                rows={2}
                value={formData.expectedAnswer}
                onChange={(e) => setFormData((f) => ({ ...f, expectedAnswer: e.target.value }))}
                placeholder="Enter the expected answer…"
              />
            </div>
            <div>
              <label className="label">Expected Sources (comma-separated)</label>
              <input
                className="input mt-1"
                value={formData.expectedSources.join(", ")}
                onChange={(e) =>
                  setFormData((f) => ({
                    ...f,
                    expectedSources: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  }))
                }
                placeholder="e.g. access-policy.md, password-policy.md"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={editingIndex !== null ? handleUpdate : handleAdd}
                className="btn-primary text-xs"
              >
                {editingIndex !== null ? "Update" : "Add"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {dataset.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Question</th>
                  <th className="px-3 py-2">Expected Answer</th>
                  <th className="px-3 py-2">Sources</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dataset.map((entry, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{entry.question}</td>
                    <td className="px-3 py-2 text-gray-600">{entry.expectedAnswer}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {entry.expectedSources.join(", ")}
                    </td>
                    <td className="px-3 py-2 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => startEdit(i)}
                        className="rounded px-2 py-1 text-xs font-medium text-accent-600 hover:bg-accent-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(i)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Running indicator with progress */}
      {status === "running" && (
        <div className="card text-center text-sm text-gray-500">
          {streamProgress ? (
            <>
              ⏳ Evaluating question {streamProgress.current} of {streamProgress.total}…
              <div className="mt-2 mx-auto w-full max-w-md bg-gray-200 rounded-full h-2">
                <div
                  className="bg-brand-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(streamProgress.current / streamProgress.total) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <>⏳ Starting evaluation pipeline…</>
          )}
        </div>
      )}

      {/* Streaming partial results (while running) */}
      {status === "running" && streamingResults.length > 0 && (
        renderResultsTable(streamingResults, expandedRow, setExpandedRow, expandedPrompts, setExpandedPrompts)
      )}

      {/* Error with partial results */}
      {status === "error" && streamingResults.length > 0 && !summary && (
        renderResultsTable(streamingResults, expandedRow, setExpandedRow, expandedPrompts, setExpandedPrompts)
      )}

      {/* Final results (when done) */}
      {summary && (
        <>
          {renderScoreCards(summary)}
          {renderResultsTable(summary.results, expandedRow, setExpandedRow, expandedPrompts, setExpandedPrompts)}
        </>
      )}

      {/* ── Run History ───────────────────────── */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800">Run History</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No saved evaluation runs yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2 text-center">Questions</th>
                  <th className="px-3 py-2 text-center">Avg Retrieval</th>
                  <th className="px-3 py-2 text-center">Avg Faithfulness</th>
                  <th className="px-3 py-2 text-center">Avg Answer</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-medium">{run.provider}</td>
                    <td className="px-3 py-2 text-center">{run.totalQuestions}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${scoreColor(run.avgRetrieval)}`}>
                        {run.avgRetrieval.toFixed(2)}/5
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${scoreColor(run.avgFaithfulness)}`}>
                        {run.avgFaithfulness.toFixed(2)}/5
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${scoreColor(run.avgAnswer ?? 0)}`}>
                        {(run.avgAnswer ?? 0).toFixed(2)}/5
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => handleViewRun(run.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-accent-600 hover:bg-accent-50"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRun(run.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected historical run detail */}
      {selectedRun && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              Run Detail — {new Date(selectedRun.createdAt).toLocaleString()} ({selectedRun.provider})
            </h2>
            <button
              type="button"
              onClick={() => setSelectedRun(null)}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
          {renderScoreCards(selectedRun.summary)}
          {renderResultsTable(selectedRun.summary.results, historyExpandedRow, setHistoryExpandedRow, historyExpandedPrompts, setHistoryExpandedPrompts)}
        </div>
      )}
    </div>
  );
}

/* ── Shared sub-components ──────────────────────────── */

function renderScoreCards(summary: EvalSummary) {
  const scoreColor = (score: number) => {
    if (score >= 4) return "text-green-700 bg-green-50";
    if (score >= 3) return "text-yellow-700 bg-yellow-50";
    return "text-red-700 bg-red-50";
  };
  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="card text-center">
        <div className="text-xs uppercase text-gray-500">Questions</div>
        <div className="mt-1 text-2xl font-bold">{summary.totalQuestions}</div>
      </div>
      <div className="card text-center">
        <div className="text-xs uppercase text-gray-500">Avg Retrieval</div>
        <div className={`mt-1 inline-block rounded px-2 text-2xl font-bold ${scoreColor(summary.avgRetrieval)}`}>
          {summary.avgRetrieval.toFixed(2)}/5
        </div>
      </div>
      <div className="card text-center">
        <div className="text-xs uppercase text-gray-500">Avg Faithfulness</div>
        <div className={`mt-1 inline-block rounded px-2 text-2xl font-bold ${scoreColor(summary.avgFaithfulness)}`}>
          {summary.avgFaithfulness.toFixed(2)}/5
        </div>
      </div>
      <div className="card text-center">
        <div className="text-xs uppercase text-gray-500">Avg Answer</div>
        <div className={`mt-1 inline-block rounded px-2 text-2xl font-bold ${scoreColor(summary.avgAnswer)}`}>
          {summary.avgAnswer.toFixed(2)}/5
        </div>
      </div>
    </div>
  );
}

function PromptBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="mt-2">
      <div className="text-xs font-semibold text-gray-500 mb-1">{label}</div>
      <pre className="whitespace-pre-wrap rounded bg-gray-900 text-gray-100 p-3 text-xs max-h-60 overflow-y-auto">
        {content}
      </pre>
    </div>
  );
}

function renderResultsTable(
  results: EvalResult[],
  expandedRow: number | null,
  setExpandedRow: (i: number | null) => void,
  expandedPrompts: number | null,
  setExpandedPrompts: (i: number | null) => void,
) {
  const scoreColor = (score: number) => {
    if (score >= 4) return "text-green-700 bg-green-50";
    if (score >= 3) return "text-yellow-700 bg-yellow-50";
    return "text-red-700 bg-red-50";
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-800">Per-Question Results</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Question</th>
              <th className="px-3 py-2">Generated Answer</th>
              <th className="px-3 py-2 text-center">Retrieval</th>
              <th className="px-3 py-2 text-center">Faithfulness</th>
              <th className="px-3 py-2 text-center">Answer</th>
              <th className="px-3 py-2">Cited Sources</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const isExpanded = expandedRow === i;
              const isPromptsOpen = expandedPrompts === i;
              return (
                <React.Fragment key={i}>
                <tr
                  className="border-b last:border-0 cursor-pointer hover:bg-gray-50 transition-colors align-top"
                  onClick={() => setExpandedRow(isExpanded ? null : i)}
                >
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className={`px-3 py-2 font-medium ${isExpanded ? "whitespace-normal" : "max-w-xs truncate"}`}>
                    {r.question}
                  </td>
                  <td className={`px-3 py-2 text-gray-600 ${isExpanded ? "whitespace-normal" : "max-w-sm"}`}>
                    <div className={isExpanded ? "" : "line-clamp-3"}>{r.generatedAnswer}</div>
                    {isExpanded && (
                      <>
                        <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-500">
                          <span className="font-semibold">Expected:</span> {r.expectedAnswer}
                        </div>
                        {r.prompts && (
                          <div className="mt-2">
                            <button
                              type="button"
                              className="text-xs font-medium text-accent-600 hover:text-accent-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedPrompts(isPromptsOpen ? null : i);
                              }}
                            >
                              {isPromptsOpen ? "▼ Hide Prompts" : "▶ Show Prompts"}
                            </button>
                            {isPromptsOpen && (
                              <div className="mt-1 space-y-2">
                                <PromptBlock label="RAG System Prompt" content={r.prompts.ragSystemPrompt} />
                                <PromptBlock label="RAG User Message (context + question)" content={r.prompts.ragUserMessage} />
                                <PromptBlock label="Judge System Prompt" content={r.prompts.judgeSystemPrompt} />
                                <PromptBlock label="Judge User Message" content={r.prompts.judgeUserMessage} />
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${scoreColor(r.retrievalScore)}`}>
                      {r.retrievalScore}/5
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${scoreColor(r.faithfulnessScore)}`}>
                      {r.faithfulnessScore}/5
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${scoreColor(r.answerScore)}`}>
                      {r.answerScore}/5
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-xs text-gray-500 ${isExpanded ? "whitespace-normal" : ""}`}>
                    {r.citedSources.join(", ") || "—"}
                    {isExpanded && r.expectedSources.length > 0 && (
                      <div className="mt-1 text-gray-400">
                        <span className="font-semibold">Expected:</span> {r.expectedSources.join(", ")}
                      </div>
                    )}
                  </td>
                </tr>
                {isExpanded && r.judgeReasoning && (
                  <tr className="bg-gray-50">
                    <td colSpan={7} className="px-3 py-2">
                      <p className="text-xs text-gray-500 italic">
                        <span className="font-semibold not-italic text-gray-600">Judge Reasoning:</span>{" "}
                        {r.judgeReasoning}
                      </p>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
