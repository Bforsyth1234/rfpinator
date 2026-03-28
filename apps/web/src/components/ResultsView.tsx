"use client";

import { useState } from "react";
import type { Citation, QuestionnaireRow } from "@rfpinator/shared";
import {
  exportResultsFile,
  type QuestionnaireExportTemplate,
} from "@/lib/questionnaire-export";
import type { StreamProgress } from "./Dashboard";

interface ResultsViewProps {
  rows: QuestionnaireRow[];
  exportTemplate?: QuestionnaireExportTemplate | null;
  onUpdateRow: (id: string, updates: Partial<QuestionnaireRow>) => void;
  onRemoveRow: (id: string) => void;
  onRetryRow: (id: string) => void;
  streamProgress?: StreamProgress | null;
}

export function ResultsView({
  rows,
  exportTemplate,
  onUpdateRow,
  onRemoveRow,
  onRetryRow,
  streamProgress,
}: ResultsViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());

  const toggleExpanded = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (row: QuestionnaireRow) => {
    setEditingId(row.id);
    setEditText(row.answer ?? "");
  };

  const saveEdit = (id: string) => {
    onUpdateRow(id, { answer: editText, status: "edited" });
    setEditingId(null);
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const approve = (id: string) => {
    onUpdateRow(id, { status: "approved" });
  };

  const approveAll = () => {
    rows.forEach((row) => {
      if (row.status !== "approved" && row.status !== "error") {
        onUpdateRow(row.id, { status: "approved" });
      }
    });
  };

  const isStreaming = streamProgress !== null && streamProgress !== undefined;

  if (rows.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <p className="text-lg font-medium">No results yet</p>
        <p className="mt-1 text-sm">
          Upload documents and a questionnaire to generate answers.
        </p>
      </div>
    );
  }

  if (rows.length === 0 && isStreaming) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-brand-primary" />
        <p className="mt-4 text-lg font-medium">Generating answers…</p>
        <p className="mt-1 text-sm">
          {streamProgress.completed} of {streamProgress.total} questions processed
        </p>
      </div>
    );
  }

  const approved = rows.filter((r) => r.status === "approved").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const answerable = rows.filter((r) => r.answerable !== false && r.status !== "error").length;
  const unanswerable = rows.length - answerable - errorCount;
  const allApproved = rows.length > 0 && rows.every((r) => r.status === "approved");
  const exportLabel = exportTemplate?.kind === "xlsx" ? "Export XLSX" : "Export CSV";

  const exportResults = async () => {
    if (!allApproved) return;
    await exportResultsFile(rows, exportTemplate);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Results</h1>
          <p className="mt-1 text-sm text-gray-500">
            {approved} of {rows.length} approved
          </p>
          <div className="mt-1 flex items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-1 text-green-700">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              {answerable} answerable
            </span>
            {unanswerable > 0 && (
              <span className="inline-flex items-center gap-1 text-red-700">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                {unanswerable} unanswerable
              </span>
            )}
            {errorCount > 0 && (
              <span className="inline-flex items-center gap-1 text-orange-700">
                <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
                {errorCount} failed
              </span>
            )}
          </div>
          {isStreaming && (
            <div className="mt-2">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-primary" />
                <span>
                  Processing {streamProgress.completed} of {streamProgress.total}…
                  {streamProgress.failed > 0 && ` (${streamProgress.failed} failed)`}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-64 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-brand-primary transition-all duration-300"
                  style={{ width: `${(streamProgress.completed / streamProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={approveAll}
              disabled={allApproved}
              className="btn-secondary"
            >
              Approve All
            </button>
            <button
              type="button"
              onClick={exportResults}
              disabled={!allApproved}
              className="btn-primary"
            >
              {exportLabel}
            </button>
          </div>
          {!allApproved && (
            <p className="text-sm text-gray-500">
              All answers must be approved before export.
            </p>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-surface-border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Location
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Question
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Generated Answer
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Source Citation
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={
                  row.status === "error"
                    ? "border-l-4 border-orange-300 bg-orange-50 hover:bg-orange-100"
                    : row.answerable === false
                      ? "border-l-4 border-red-200 bg-red-50 hover:bg-red-100"
                      : "hover:bg-gray-50"
                }
              >
                {/* Location */}
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                  {row.location ? (
                    <div className="space-y-0.5">
                      {row.location.sheetName && (
                        <p className="font-medium text-gray-700">{row.location.sheetName}</p>
                      )}
                      <p>Row {row.location.row}, Col {row.location.column}</p>
                    </div>
                  ) : (
                    <span className="italic text-gray-400">—</span>
                  )}
                </td>

                {/* Question */}
                <td className="max-w-xs px-4 py-3 text-sm text-gray-900">
                  <div>
                    <p className={`whitespace-pre-wrap ${expandedQuestions.has(row.id) ? "" : "line-clamp-3"}`}>
                      {row.question}
                    </p>
                    {row.question && row.question.length > 150 && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(setExpandedQuestions, row.id)}
                        className="mt-1 text-xs font-medium text-brand-primary hover:underline"
                      >
                        {expandedQuestions.has(row.id) ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                </td>

                {/* Answer */}
                <td className="max-w-sm px-4 py-3 text-sm text-gray-700">
                  {editingId === row.id ? (
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={4}
                      className="input w-full"
                    />
                  ) : (
                    <div>
                      <p
                        className={`whitespace-pre-wrap ${expandedAnswers.has(row.id) ? "" : "line-clamp-4"}`}
                      >
                        {row.answer}
                      </p>
                      {row.answer && row.answer.length > 200 && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(setExpandedAnswers, row.id)}
                          className="mt-1 text-xs font-medium text-brand-primary hover:underline"
                        >
                          {expandedAnswers.has(row.id) ? "Show less" : "Show more"}
                        </button>
                      )}
                    </div>
                  )}
                </td>

                {/* Citation */}
                <td className="max-w-[240px] px-4 py-3 text-sm text-gray-500">
                  {row.citations && row.citations.length > 0 ? (
                    <ul className="space-y-1">
                      {row.citations.map((c, i) => (
                        <CitationItem key={`${row.id}-${c.source}-${c.page ?? i}`} citation={c} />
                      ))}
                    </ul>
                  ) : (
                    <span className="italic text-gray-400">None</span>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>

                {/* Actions */}
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                  {editingId === row.id ? (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => saveEdit(row.id)} className="btn-primary text-xs">
                        Save
                      </button>
                      <button onClick={cancelEdit} className="btn-secondary text-xs">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      {row.status === "error" ? (
                        <button
                          onClick={() => onRetryRow(row.id)}
                          className="rounded border border-orange-400 bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200"
                        >
                          Retry
                        </button>
                      ) : (
                        <>
                          {row.status !== "approved" && (
                            <button onClick={() => approve(row.id)} className="btn-primary text-xs">
                              Approve
                            </button>
                          )}
                          <button onClick={() => startEdit(row)} className="btn-secondary text-xs">
                            Edit
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => onRemoveRow(row.id)}
                        className="rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                        title="Not a Question — remove this row"
                      >
                        Not a Question
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CitationItem({ citation }: { citation: Citation }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <li className="rounded-md border border-surface-border bg-gray-50 p-2">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="flex w-full items-start gap-2 text-left"
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 text-xs text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-gray-700">
            📎 {citation.source}
            {citation.page != null && ` (p.${citation.page})`}
          </span>
          <span className="mt-0.5 block text-xs text-accent-600">
            {isExpanded ? "Hide citation text" : "Show citation text"}
          </span>
        </span>
      </button>

      {isExpanded && (
        <blockquote className="mt-2 border-t border-l-2 border-surface-border pt-2 pl-3 text-xs leading-5 text-gray-600 whitespace-pre-wrap break-words italic">
          “{citation.text}”
        </blockquote>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: QuestionnaireRow["status"] }) {
  const cls =
    status === "approved"
      ? "badge-approved"
      : status === "edited"
        ? "badge-edited"
        : status === "error"
          ? "inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700"
          : "badge-pending";
  return <span className={cls}>{status}</span>;
}

