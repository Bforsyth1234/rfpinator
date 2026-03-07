"use client";

import { useState } from "react";
import type { QuestionnaireRow } from "@rfpinator/shared";

interface ResultsViewProps {
  rows: QuestionnaireRow[];
  onUpdateRow: (id: string, updates: Partial<QuestionnaireRow>) => void;
}

export function ResultsView({ rows, onUpdateRow }: ResultsViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

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

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <p className="text-lg font-medium">No results yet</p>
        <p className="mt-1 text-sm">
          Upload documents and a questionnaire to generate answers.
        </p>
      </div>
    );
  }

  const approved = rows.filter((r) => r.status === "approved").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Results</h1>
          <p className="mt-1 text-sm text-gray-500">
            {approved} of {rows.length} approved
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-surface-border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-gray-50">
            <tr>
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
              <tr key={row.id} className="hover:bg-gray-50">
                {/* Question */}
                <td className="max-w-xs px-4 py-3 text-sm text-gray-900">
                  <p className="line-clamp-3">{row.question}</p>
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
                    <p className="line-clamp-4 whitespace-pre-wrap">
                      {row.answer}
                    </p>
                  )}
                </td>

                {/* Citation */}
                <td className="max-w-[200px] px-4 py-3 text-sm text-gray-500">
                  {row.citations && row.citations.length > 0 ? (
                    <ul className="space-y-1">
                      {row.citations.map((c, i) => (
                        <li key={i} className="truncate" title={c.text}>
                          📎 {c.source}
                          {c.page != null && ` (p.${c.page})`}
                        </li>
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
                      {row.status !== "approved" && (
                        <button onClick={() => approve(row.id)} className="btn-primary text-xs">
                          Approve
                        </button>
                      )}
                      <button onClick={() => startEdit(row)} className="btn-secondary text-xs">
                        Edit
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

function StatusBadge({ status }: { status: QuestionnaireRow["status"] }) {
  const cls =
    status === "approved"
      ? "badge-approved"
      : status === "edited"
        ? "badge-edited"
        : "badge-pending";
  return <span className={cls}>{status}</span>;
}

