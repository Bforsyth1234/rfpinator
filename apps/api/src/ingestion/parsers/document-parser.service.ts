import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs/promises";
import * as path from "path";

export interface ParsedDocument {
  /** Raw text content of the document */
  text: string;
  /** Original filename */
  filename: string;
  /** Detected MIME type */
  mimeType: string;
  /** Per-page or per-section text segments with metadata */
  segments: DocumentSegment[];
}

export interface DocumentSegment {
  text: string;
  /** Page number (PDF) or section heading (Markdown) */
  pageOrSection?: string;
}

@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);

  async parseFile(filePath: string): Promise<ParsedDocument> {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath);

    switch (ext) {
      case ".md":
      case ".markdown":
        return this.parseMarkdown(filePath, filename);
      case ".pdf":
        return this.parsePdf(filePath, filename);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  async parseBuffer(
    buffer: Buffer,
    filename: string,
    mimeType?: string,
  ): Promise<ParsedDocument> {
    const ext = path.extname(filename).toLowerCase();
    const resolvedMime =
      mimeType ?? (ext === ".pdf" ? "application/pdf" : "text/markdown");

    if (resolvedMime === "application/pdf" || ext === ".pdf") {
      return this.parsePdfBuffer(buffer, filename);
    }
    return this.parseMarkdownBuffer(buffer.toString("utf-8"), filename);
  }

  private async parseMarkdown(
    filePath: string,
    filename: string,
  ): Promise<ParsedDocument> {
    const content = await fs.readFile(filePath, "utf-8");
    return this.parseMarkdownBuffer(content, filename);
  }

  parseMarkdownBuffer(content: string, filename: string): ParsedDocument {
    const segments = this.splitMarkdownBySections(content);
    return {
      text: content,
      filename,
      mimeType: "text/markdown",
      segments,
    };
  }

  private splitMarkdownBySections(content: string): DocumentSegment[] {
    const lines = content.split("\n");
    const segments: DocumentSegment[] = [];
    let currentSection = "Introduction";
    let currentText: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        if (currentText.length > 0) {
          const text = currentText.join("\n").trim();
          if (text) {
            segments.push({ text, pageOrSection: currentSection });
          }
        }
        currentSection = headingMatch[2].trim();
        currentText = [line];
      } else {
        currentText.push(line);
      }
    }

    if (currentText.length > 0) {
      const text = currentText.join("\n").trim();
      if (text) {
        segments.push({ text, pageOrSection: currentSection });
      }
    }

    return segments.length > 0
      ? segments
      : [{ text: content, pageOrSection: "Document" }];
  }

  private async parsePdf(
    filePath: string,
    filename: string,
  ): Promise<ParsedDocument> {
    const buffer = await fs.readFile(filePath);
    return this.parsePdfBuffer(buffer, filename);
  }

  private async parsePdfBuffer(
    buffer: Buffer,
    filename: string,
  ): Promise<ParsedDocument> {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await parser.getText();

    const segments: DocumentSegment[] = textResult.pages
      .map((page) => ({
        text: page.text.trim(),
        pageOrSection: `Page ${page.num}`,
      }))
      .filter((s) => s.text.length > 0);

    const fullText = textResult.text;

    await parser.destroy();

    return {
      text: fullText,
      filename,
      mimeType: "application/pdf",
      segments: segments.length > 0 ? segments : [{ text: fullText, pageOrSection: "Page 1" }],
    };
  }

  getSupportedExtensions(): string[] {
    return [".md", ".markdown", ".pdf"];
  }
}

