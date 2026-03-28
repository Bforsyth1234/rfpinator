import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  RagQueryRequest,
  RagQueryResponse,
  QuestionnaireColumnDetectionRequest,
  QuestionnaireColumnDetectionResponse,
  QuestionnaireRowClassificationRequest,
  QuestionnaireRowClassificationResponse,
  EvalSummary,
  SavedEvalRun,
  SavedEvalRunListItem,
  GoldenDatasetEntry,
} from '../models/types';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  // ── Health ──────────────────────────────────────────────

  getHealth(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.base}/`);
  }

  // ── Providers ───────────────────────────────────────────

  getProviders(): Observable<{ providers: string[] }> {
    return this.http.get<{ providers: string[] }>(`${this.base}/query/providers`);
  }

  // ── Query ───────────────────────────────────────────────

  query(request: RagQueryRequest): Observable<RagQueryResponse> {
    return this.http.post<RagQueryResponse>(`${this.base}/query`, request);
  }

  // ── Ingestion ───────────────────────────────────────────

  uploadFile(file: File): Observable<{ message: string; chunks: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ message: string; chunks: number }>(
      `${this.base}/ingestion/upload`,
      formData
    );
  }

  ingestDirectory(
    directoryPath: string,
    glob?: string
  ): Observable<{ message: string; files: number; chunks: number }> {
    return this.http.post<{ message: string; files: number; chunks: number }>(
      `${this.base}/ingestion/directory`,
      { directoryPath, glob }
    );
  }

  listDocuments(): Observable<{
    documents: Array<{ id: string; source: string; chunks: number }>;
  }> {
    return this.http.get<{
      documents: Array<{ id: string; source: string; chunks: number }>;
    }>(`${this.base}/ingestion/documents`);
  }

  deleteDocument(source: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.base}/ingestion/documents/${encodeURIComponent(source)}`
    );
  }

  // ── Column Detection ────────────────────────────────────

  detectColumns(
    request: QuestionnaireColumnDetectionRequest
  ): Observable<QuestionnaireColumnDetectionResponse> {
    return this.http.post<QuestionnaireColumnDetectionResponse>(
      `${this.base}/query/detect-columns`,
      request
    );
  }

  // ── Row Classification ──────────────────────────────────

  classifyRows(
    request: QuestionnaireRowClassificationRequest
  ): Observable<QuestionnaireRowClassificationResponse> {
    return this.http.post<QuestionnaireRowClassificationResponse>(
      `${this.base}/query/classify-rows`,
      request
    );
  }

  // ── Evaluation ──────────────────────────────────────────

  runEvaluation(
    dataset: GoldenDatasetEntry[],
    provider?: string
  ): Observable<EvalSummary> {
    return this.http.post<EvalSummary>(`${this.base}/evaluation/run`, {
      dataset,
      provider,
    });
  }

  listEvalRuns(): Observable<SavedEvalRunListItem[]> {
    return this.http.get<SavedEvalRunListItem[]>(`${this.base}/evaluation/runs`);
  }

  getEvalRun(id: string): Observable<SavedEvalRun> {
    return this.http.get<SavedEvalRun>(`${this.base}/evaluation/runs/${id}`);
  }

  deleteEvalRun(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(
      `${this.base}/evaluation/runs/${id}`
    );
  }

  streamEvaluation(
    dataset: GoldenDatasetEntry[],
    provider?: string
  ): EventSource {
    const params = new URLSearchParams({
      provider: provider ?? 'groq',
      dataset: JSON.stringify(dataset),
    });
    return new EventSource(`${this.base}/evaluation/stream?${params}`);
  }
}
