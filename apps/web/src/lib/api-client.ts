/**
 * Typed API client for the RFPinator backend.
 * Base URL defaults to localhost:3001 (NestJS API).
 */
import type {
  RagQueryRequest,
  RagQueryResponse,
  IngestBatchResponse,
} from "@rfpinator/shared";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Generic fetch wrapper with error handling */
async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
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

// ── Providers ──────────────────────────────

export async function fetchProviders(): Promise<string[]> {
  const data = await apiFetch<{ providers: string[] }>(
    "/query/providers",
  );
  return data.providers;
}

// ── Query ──────────────────────────────────

export async function submitQuery(
  req: RagQueryRequest,
): Promise<RagQueryResponse> {
  return apiFetch<RagQueryResponse>("/query", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ── Ingestion (file upload) ────────────────

export async function uploadFiles(
  files: File[],
): Promise<IngestBatchResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  const res = await fetch(`${API_BASE}/ingestion/upload`, {
    method: "POST",
    body: formData,
    // Do NOT set Content-Type — browser sets multipart boundary
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<IngestBatchResponse>;
}

