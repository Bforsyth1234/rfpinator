import * as XLSX from "xlsx";
import type {
  Citation,
  QuestionnaireColumnDetectionResponse,
  QuestionnaireRow,
  QuestionnaireRowLocation,
} from "@rfpinator/shared";
import { detectQuestionnaireColumns, classifyQuestionnaireRows } from "./api-client";

const QUESTION_HEADER_PATTERN = /(question|prompt|requirement|control|item|description|request)/i;
const ANSWER_HEADER_PATTERN = /(answer|response|reply|remarks?|comments?)/i;
const STATUS_HEADER_PATTERN = /status/i;
const CITATIONS_HEADER_PATTERN = /(citation|source)/i;
const AI_SAMPLE_ROW_LIMIT = 25;
const AI_SAMPLE_COLUMN_LIMIT = 30;

export interface ParsedQuestionnaireRow {
  id: string;
  question: string;
  location?: QuestionnaireRowLocation;
}

export interface CsvExportTemplate {
  kind: "csv";
  fileName: string;
}

export interface XlsxSheetMapping {
  sheetName: string;
  headerRowIndex: number;
  questionColumnIndex: number;
  answerColumnIndex?: number;
  statusColumnIndex?: number;
  citationsColumnIndex?: number;
  rowMappings: Array<{ resultId: string; sheetRowIndex: number }>;
}

export interface XlsxExportTemplate {
  kind: "xlsx";
  fileName: string;
  workbookData: ArrayBuffer;
  sheets: XlsxSheetMapping[];
}

export type QuestionnaireExportTemplate = CsvExportTemplate | XlsxExportTemplate;

export interface ParsedQuestionnaire {
  questions: ParsedQuestionnaireRow[];
  exportTemplate: QuestionnaireExportTemplate;
}

export async function parseQuestionnaireFile(
  file: File,
  modelChoice?: string,
): Promise<ParsedQuestionnaire> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    return parseXlsxQuestionnaire(file, modelChoice);
  }

  const text = await file.text();
  return {
    questions: parseCsvQuestions(text),
    exportTemplate: { kind: "csv", fileName: file.name },
  };
}

export async function exportResultsFile(
  rows: QuestionnaireRow[],
  exportTemplate?: QuestionnaireExportTemplate | null,
): Promise<void> {
  if (exportTemplate?.kind === "xlsx") {
    await exportResultsXlsx(rows, exportTemplate);
    return;
  }

  const csv = buildResultsCsv(rows);
  downloadCsv(csv, buildCsvExportFilename(exportTemplate?.fileName));
}

function parseCsvQuestions(text: string): ParsedQuestionnaireRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const parseCsvRow = (line: string): string[] =>
    line.split(",").map((cell) => cell.replace(/^"|"$/g, "").trim());

  const headerCells = parseCsvRow(lines[0]);
  const questionColumnIndex = headerCells.findIndex((cell) =>
    QUESTION_HEADER_PATTERN.test(cell),
  );
  const start = questionColumnIndex >= 0 ? 1 : 0;
  const columnIndex = questionColumnIndex >= 0 ? questionColumnIndex : 0;

  return lines
    .slice(start)
    .map((line, index) => ({
      id: `q-${index}`,
      question: parseCsvRow(line)[columnIndex] ?? "",
    }))
    .filter((row) => row.question.trim())
    .map((row) => ({ ...row, question: row.question.trim() }));
}

async function parseXlsxQuestionnaire(
  file: File,
  modelChoice?: string,
): Promise<ParsedQuestionnaire> {
  const workbookData = await file.arrayBuffer();
  const workbook = XLSX.read(workbookData, { type: "array" });

  const allQuestions: ParsedQuestionnaireRow[] = [];
  const sheetMappings: XlsxSheetMapping[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: true,
    });

    const rows = matrix.map((row) => row.map((cell) => String(cell ?? "").trim()));
    // Skip sheets with very few content rows (likely intro/cover sheets)
    const nonEmptyRows = rows.filter((r) => r.some((c) => c.length > 0));
    if (nonEmptyRows.length < 3) continue;

    const parsed = await parseSheetQuestions(file.name, sheetName, rows, modelChoice);
    if (parsed.questions.length === 0) continue;

    allQuestions.push(...parsed.questions);
    sheetMappings.push(parsed.sheetMapping);
  }

  return {
    questions: allQuestions,
    exportTemplate: {
      kind: "xlsx",
      fileName: file.name,
      workbookData: workbookData.slice(0),
      sheets: sheetMappings,
    },
  };
}

/**
 * Parse a single sheet: detect columns, extract candidate rows, classify via AI.
 */
async function parseSheetQuestions(
  fileName: string,
  sheetName: string,
  rows: string[][],
  modelChoice?: string,
): Promise<{ questions: ParsedQuestionnaireRow[]; sheetMapping: XlsxSheetMapping }> {
  const heuristicHeaderRowIndex = findHeaderRowIndex(rows);
  const aiDetection = await detectQuestionnaireColumnsSafe(
    `${fileName} [${sheetName}]`,
    rows,
    modelChoice,
  );
  const headerRowIndex =
    isValidRowIndex(aiDetection?.headerRowIndex, rows) ? aiDetection.headerRowIndex : heuristicHeaderRowIndex;
  const headerRow = rows[headerRowIndex] ?? [];
  const dataRows = rows.slice(headerRowIndex + 1);
  const heuristicQuestionColumnIndex = detectQuestionColumnIndex(headerRow, dataRows);
  const questionColumnIndex =
    isValidColumnIndex(aiDetection?.questionColumnIndex, rows)
      ? aiDetection.questionColumnIndex
      : heuristicQuestionColumnIndex;
  const answerColumnIndex =
    isValidAnswerColumnIndex(aiDetection, rows, questionColumnIndex)
      ? aiDetection.answerColumnIndex
      : detectOptionalColumnByHeader(headerRow, ANSWER_HEADER_PATTERN);
  const statusColumnIndex = detectColumnByHeader(headerRow, STATUS_HEADER_PATTERN);
  const citationsColumnIndex = detectColumnByHeader(headerRow, CITATIONS_HEADER_PATTERN);

  // Extract candidate question rows
  const candidates = rows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ rowIndex }) => rowIndex > headerRowIndex)
    .map(({ row, rowIndex }) => ({
      id: `${sheetName}:q-${rowIndex}`,
      question: String(row[questionColumnIndex] ?? "").trim(),
      sheetRowIndex: rowIndex,
    }))
    .filter((row) => row.question.length > 0);

  if (candidates.length === 0) {
    return {
      questions: [],
      sheetMapping: buildSheetMapping(sheetName, headerRowIndex, questionColumnIndex, answerColumnIndex, statusColumnIndex, citationsColumnIndex, []),
    };
  }

  // Use AI to filter out section titles/headings
  const classified = await classifyRowsSafe(candidates, modelChoice);

  const columnLetter = columnIndexToLetter(questionColumnIndex);

  return {
    questions: classified.map(({ id, question, sheetRowIndex }) => ({
      id,
      question,
      location: {
        sheetName,
        row: sheetRowIndex + 1, // convert 0-based to 1-based display
        column: columnLetter,
      },
    })),
    sheetMapping: buildSheetMapping(
      sheetName, headerRowIndex, questionColumnIndex, answerColumnIndex,
      statusColumnIndex, citationsColumnIndex,
      classified.map((r) => ({ resultId: r.id, sheetRowIndex: r.sheetRowIndex })),
    ),
  };
}

function buildSheetMapping(
  sheetName: string,
  headerRowIndex: number,
  questionColumnIndex: number,
  answerColumnIndex: number | undefined,
  statusColumnIndex: number,
  citationsColumnIndex: number,
  rowMappings: Array<{ resultId: string; sheetRowIndex: number }>,
): XlsxSheetMapping {
  return {
    sheetName,
    headerRowIndex,
    questionColumnIndex,
    answerColumnIndex,
    statusColumnIndex: statusColumnIndex >= 0 ? statusColumnIndex : undefined,
    citationsColumnIndex: citationsColumnIndex >= 0 ? citationsColumnIndex : undefined,
    rowMappings,
  };
}

async function classifyRowsSafe(
  candidates: Array<{ id: string; question: string; sheetRowIndex: number }>,
  modelChoice?: string,
): Promise<Array<{ id: string; question: string; sheetRowIndex: number }>> {
  try {
    const response = await classifyQuestionnaireRows({
      rows: candidates.map((c) => ({ id: c.id, text: c.question })),
      model_choice: modelChoice,
    });
    const questionIds = new Set(
      response.classifications
        .filter((c) => c.isQuestion)
        .map((c) => c.id),
    );
    const filtered = candidates.filter((c) => questionIds.has(c.id));
    // If AI filtered everything out, fall back to keeping all candidates
    return filtered.length > 0 ? filtered : candidates;
  } catch {
    // On failure, keep all candidates
    return candidates;
  }
}

function findHeaderRowIndex(rows: string[][]): number {
  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const nonEmptyCells = rows[i].filter((cell) => cell.trim().length > 0);
    if (nonEmptyCells.length === 0) continue;

    const headerMatches = nonEmptyCells.filter((cell) =>
      [
        QUESTION_HEADER_PATTERN,
        ANSWER_HEADER_PATTERN,
        STATUS_HEADER_PATTERN,
        CITATIONS_HEADER_PATTERN,
      ].some((pattern) => pattern.test(cell)),
    ).length;

    const score = headerMatches * 10 + nonEmptyCells.length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function detectQuestionColumnIndex(headerRow: string[], dataRows: string[][]): number {
  const columnCount = Math.max(
    headerRow.length,
    ...dataRows.slice(0, 20).map((row) => row.length),
    1,
  );

  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const headerValue = headerRow[columnIndex] ?? "";
    const sampleCells = dataRows
      .slice(0, 20)
      .map((row) => String(row[columnIndex] ?? "").trim())
      .filter(Boolean);

    if (sampleCells.length === 0) continue;

    const averageLength =
      sampleCells.reduce((sum, cell) => sum + cell.length, 0) / sampleCells.length;
    const questionLikeCells = sampleCells.filter(
      (cell) => cell.endsWith("?") || cell.length >= 20,
    ).length;
    const headerScore = QUESTION_HEADER_PATTERN.test(headerValue) ? 100 : 0;
    // Penalize columns that look like short ID/code columns
    const looksLikeIdColumn = averageLength < 12 && headerScore > 0;
    const idPenalty = looksLikeIdColumn ? -80 : 0;
    const score = headerScore + idPenalty + questionLikeCells * 4 + averageLength / 10;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = columnIndex;
    }
  }

  return bestIndex;
}

function detectColumnByHeader(headerRow: string[], pattern: RegExp): number {
  return headerRow.findIndex((cell) => pattern.test(cell));
}

function detectOptionalColumnByHeader(
  headerRow: string[],
  pattern: RegExp,
): number | undefined {
  const index = detectColumnByHeader(headerRow, pattern);
  return index >= 0 ? index : undefined;
}

async function detectQuestionnaireColumnsSafe(
  fileName: string,
  rows: string[][],
  modelChoice?: string,
): Promise<QuestionnaireColumnDetectionResponse | null> {
  try {
    return await detectQuestionnaireColumns({
      fileName,
      rows: rows
        .slice(0, AI_SAMPLE_ROW_LIMIT)
        .map((row) => row.slice(0, AI_SAMPLE_COLUMN_LIMIT)),
      model_choice: modelChoice,
    });
  } catch {
    return null;
  }
}

function isValidRowIndex(
  value: number | undefined,
  rows: string[][],
): value is number {
  return value != null && Number.isInteger(value) && value >= 0 && value < rows.length;
}

function isValidColumnIndex(
  value: number | undefined,
  rows: string[][],
): value is number {
  if (!Number.isInteger(value) || value == null || value < 0) {
    return false;
  }

  return rows.some((row) => value < row.length);
}

function isValidAnswerColumnIndex(
  detection: QuestionnaireColumnDetectionResponse | null,
  rows: string[][],
  questionColumnIndex: number,
): detection is QuestionnaireColumnDetectionResponse & { answerColumnIndex: number } {
  return (
    detection != null &&
    isValidColumnIndex(detection.answerColumnIndex, rows) &&
    detection.answerColumnIndex !== questionColumnIndex
  );
}

async function exportResultsXlsx(rows: QuestionnaireRow[], template: XlsxExportTemplate): Promise<void> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template.workbookData);

  const rowMap = new Map(rows.map((row) => [row.id, row]));

  for (const sheetMapping of template.sheets) {
    const worksheet = workbook.getWorksheet(sheetMapping.sheetName);
    if (!worksheet) continue;

    // ExcelJS is 1-based; our mappings are 0-based
    let nextCol = worksheet.columnCount + 1;

    const answerCol = resolveColumnIndex(
      worksheet,
      sheetMapping.answerColumnIndex,
      sheetMapping.headerRowIndex,
      "Generated Answer",
      nextCol,
    );
    if (sheetMapping.answerColumnIndex == null) nextCol += 1;

    const statusCol = resolveColumnIndex(
      worksheet,
      sheetMapping.statusColumnIndex,
      sheetMapping.headerRowIndex,
      "Status",
      nextCol,
    );
    if (sheetMapping.statusColumnIndex == null) nextCol += 1;

    const citationsCol = resolveColumnIndex(
      worksheet,
      sheetMapping.citationsColumnIndex,
      sheetMapping.headerRowIndex,
      "Citations",
      nextCol,
    );

    for (const { resultId, sheetRowIndex } of sheetMapping.rowMappings) {
      const row = rowMap.get(resultId);
      if (!row) continue;

      // +1 to convert 0-based to ExcelJS 1-based
      const excelRow = sheetRowIndex + 1;
      worksheet.getCell(excelRow, answerCol).value = row.answer ?? "";
      worksheet.getCell(excelRow, statusCol).value = row.status;
      worksheet.getCell(excelRow, citationsCol).value = formatCitationsForExport(row.citations);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    buildXlsxExportFilename(template.fileName),
  );
}

/**
 * Resolve a 1-based ExcelJS column index, creating the header if needed.
 */
function resolveColumnIndex(
  worksheet: import("exceljs").Worksheet,
  existingIndex: number | undefined,
  headerRowIndex: number,
  headerLabel: string,
  fallbackCol: number,
): number {
  if (existingIndex != null) {
    return existingIndex + 1; // convert 0-based to 1-based
  }

  // Write header label into the new column
  worksheet.getCell(headerRowIndex + 1, fallbackCol).value = headerLabel;
  return fallbackCol;
}

/** Convert a 0-based column index to an Excel-style letter (0→A, 25→Z, 26→AA, …) */
function columnIndexToLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}


function buildResultsCsv(rows: QuestionnaireRow[]): string {
  const headers = ["question", "answer", "status", "citations"];
  const csvRows = rows.map((row) => [
    row.question ?? "",
    row.answer ?? "",
    row.status,
    formatCitationsForExport(row.citations),
  ]);

  return [headers, ...csvRows]
    .map((cells) => cells.map((cell) => escapeCsvValue(cell)).join(","))
    .join("\r\n");
}

function formatCitationsForExport(citations?: Citation[]): string {
  if (!citations || citations.length === 0) {
    return "";
  }

  return citations
    .map((citation) => {
      const pageLabel = citation.page != null ? ` (p.${citation.page})` : "";
      return `${citation.source}${pageLabel}: "${citation.text}"`;
    })
    .join(" | ");
}

function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsvExportFilename(fileName?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = fileName?.replace(/\.[^.]+$/, "") || "results-export";
  return `${baseName}-${timestamp}.csv`;
}

function buildXlsxExportFilename(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName}-answered.xlsx`;
}

function downloadCsv(csv: string, filename: string): void {
  downloadBlob(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }),
    filename,
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}