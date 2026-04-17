/**
 * Typed API client for the RFPinator backend.
 * In the Vite build the dev-server proxies /query, /ingestion, /evaluation
 * to http://localhost:3001, so BASE is empty for dev and can be overridden
 * via VITE_API_URL for production deployments.
 */
import type {
  QuestionnaireColumnDetectionRequest,
  QuestionnaireColumnDetectionResponse,
  QuestionnaireRowClassificationRequest,
  QuestionnaireRowClassificationResponse,
  RagQueryRequest,
  RagQueryResponse,
  IngestBatchResponse,
  EvalSummary,
  EvalResult,
  GoldenDatasetEntry,
  DocumentInfo,
  SavedEvalRun,
  SavedEvalRunListItem,
} from "@rfpinator/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** Generic fetch wrapper with error handling */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `API ${init?.method ?? "GET"} ${path} failed (${res.status}): ${body}`,
    );
  }

  return res.json() as Promise<T>;
}

// ── Providers ──────────────────────────────────────────────────────────────

export async function fetchProviders(): Promise<string[]> {
  const data = await apiFetch<{ providers: string[] }>("/query/providers");
  return data.providers;
}

// ── Query ───────────────────────────────────────────────────────────────────

export async function submitQuery(
  req: RagQueryRequest,
): Promise<RagQueryResponse> {
  if (typeof req.question !== "string" || !req.question.trim()) {
    throw new Error("Question must be a non-empty string.");
  }

  return apiFetch<RagQueryResponse>("/query", {
    method: "POST",
    body: JSON.stringify({
      ...req,
      question: req.question.trim(),
    }),
  });
}

export async function detectQuestionnaireColumns(
  req: QuestionnaireColumnDetectionRequest,
): Promise<QuestionnaireColumnDetectionResponse> {
  if (!Array.isArray(req.rows) || req.rows.length === 0) {
    throw new Error("Questionnaire rows must be a non-empty 2D array.");
  }

  return apiFetch<QuestionnaireColumnDetectionResponse>(
    "/query/detect-questionnaire-columns",
    {
      method: "POST",
      body: JSON.stringify(req),
    },
  );
}

export async function classifyQuestionnaireRows(
  req: QuestionnaireRowClassificationRequest,
): Promise<QuestionnaireRowClassificationResponse> {
  if (!Array.isArray(req.rows) || req.rows.length === 0) {
    throw new Error("Rows must be a non-empty array.");
  }

  return apiFetch<QuestionnaireRowClassificationResponse>(
    "/query/classify-questionnaire-rows",
    {
      method: "POST",
      body: JSON.stringify(req),
    },
  );
}

// ── Ingestion (file upload) ─────────────────────────────────────────────────

export async function uploadFiles(files: File[]): Promise<IngestBatchResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  const res = await fetch(`${API_BASE}/ingestion/upload`, {
    method: "POST",
    body: formData,
    // Do NOT set Content-Type — browser sets multipart boundary automatically
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<IngestBatchResponse>;
}

// ── Documents (vector store) ────────────────────────────────────────────────

export async function fetchDocuments(): Promise<DocumentInfo[]> {
  const data = await apiFetch<{ documents: DocumentInfo[] }>(
    "/ingestion/documents",
  );
  return data.documents;
}

export async function deleteDocument(
  documentId: string,
): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>(`/ingestion/documents/${documentId}`, {
    method: "DELETE",
  });
}

// ── Evaluation ──────────────────────────────────────────────────────────────

/** Fetch the default RAG and Judge system prompts from the backend */
export async function fetchPrompts(): Promise<{
  ragSystemPrompt: string;
  judgeSystemPrompt: string;
}> {
  return apiFetch<{ ragSystemPrompt: string; judgeSystemPrompt: string }>(
    "/evaluation/prompts",
  );
}

export async function fetchGoldenDataset(): Promise<GoldenDatasetEntry[]> {
  const data = await apiFetch<{ entries: GoldenDatasetEntry[] }>(
    "/evaluation/dataset",
  );
  return data.entries;
}

export async function addGoldenDatasetEntry(
  entry: GoldenDatasetEntry,
): Promise<GoldenDatasetEntry[]> {
  const data = await apiFetch<{ entries: GoldenDatasetEntry[] }>(
    "/evaluation/dataset",
    {
      method: "POST",
      body: JSON.stringify(entry),
    },
  );
  return data.entries;
}

export async function updateGoldenDatasetEntry(
  index: number,
  entry: GoldenDatasetEntry,
): Promise<GoldenDatasetEntry[]> {
  const data = await apiFetch<{ entries: GoldenDatasetEntry[] }>(
    `/evaluation/dataset/${index}`,
    {
      method: "PUT",
      body: JSON.stringify(entry),
    },
  );
  return data.entries;
}

export async function deleteGoldenDatasetEntry(
  index: number,
): Promise<GoldenDatasetEntry[]> {
  const data = await apiFetch<{ entries: GoldenDatasetEntry[] }>(
    `/evaluation/dataset/${index}`,
    {
      method: "DELETE",
    },
  );
  return data.entries;
}

export interface StreamEvaluationOptions {
  provider?: string;
  ragSystemPrompt?: string;
  judgeSystemPrompt?: string;
  onResult: (result: EvalResult, index: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Stream evaluation results via SSE (POST-based to support custom prompts).
 * Calls `onResult` for each per-question result and returns the final EvalSummary.
 */
export async function streamEvaluation(
  options: StreamEvaluationOptions,
): Promise<EvalSummary> {
  const res = await fetch(`${API_BASE}/evaluation/run/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: options.provider,
      ragSystemPrompt: options.ragSystemPrompt,
      judgeSystemPrompt: options.judgeSystemPrompt,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SSE stream failed (${res.status}): ${body}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalSummary: EvalSummary | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE frames: "data: {...}\n\n"
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6);
        try {
          const event = JSON.parse(json);
          if (event.type === "result") {
            options.onResult(
              event.result as EvalResult,
              event.index,
              event.total,
            );
          } else if (event.type === "summary") {
            finalSummary = event.summary as EvalSummary;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue; // skip malformed frames
          throw e;
        }
      }
    }
  }

  if (!finalSummary) {
    throw new Error("Stream ended without a summary event");
  }
  return finalSummary;
}

// ── Eval Run History ────────────────────────────────────────────────────────

export async function fetchEvalRuns(): Promise<SavedEvalRunListItem[]> {
  const data = await apiFetch<{ runs: SavedEvalRunListItem[] }>(
    "/evaluation/runs",
  );
  return data.runs;
}

export async function fetchEvalRun(id: string): Promise<SavedEvalRun> {
  return apiFetch<SavedEvalRun>(`/evaluation/runs/${id}`);
}

export async function deleteEvalRun(id: string): Promise<void> {
  await apiFetch<{ success: boolean }>(`/evaluation/runs/${id}`, {
    method: "DELETE",
  });
}
