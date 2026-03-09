"use client";

import { useCallback, useEffect, useState } from "react";
import type { DocumentInfo } from "@rfpinator/shared";
import { fetchDocuments, deleteDocument, uploadFiles } from "@/lib/api-client";

export function DocumentsView() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleDelete = useCallback(
    async (documentId: string, source: string) => {
      if (!confirm(`Delete "${source}" and all its chunks?`)) return;
      try {
        await deleteDocument(documentId);
        setDocuments((prev) => prev.filter((d) => d.documentId !== documentId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [],
  );

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        await uploadFiles(Array.from(fileList));
        await loadDocuments();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [loadDocuments],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage documents in the vector store. Upload new documents or remove existing ones.
          </p>
        </div>
        <label className="btn-primary cursor-pointer">
          {uploading ? "Uploading…" : "Upload Documents"}
          <input
            type="file"
            multiple
            accept=".md,.pdf,.txt,.docx"
            onChange={handleUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800">
          Vector Store ({documents.length} documents)
        </h2>

        {loading ? (
          <p className="mt-3 text-sm text-gray-500">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            No documents uploaded yet. Upload documents to get started.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">Filename</th>
                  <th className="px-3 py-2 text-center">Chunks</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.documentId} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{doc.source}</td>
                    <td className="px-3 py-2 text-center text-gray-500">
                      {doc.chunkCount}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.documentId, doc.source)}
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
    </div>
  );
}

