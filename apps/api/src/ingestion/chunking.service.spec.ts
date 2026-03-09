// Mock llamaindex SentenceSplitter to avoid ESM import issues in Jest
jest.mock("llamaindex", () => ({
  SentenceSplitter: class MockSentenceSplitter {
    private chunkSize: number;
    constructor(params: { chunkSize: number; chunkOverlap: number }) {
      this.chunkSize = params.chunkSize;
    }
    splitText(text: string): string[] {
      // Simple mock: split into chunks of ~100 chars for testing
      if (text.length <= 200) return [text];
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += 150) {
        chunks.push(text.slice(i, i + 200));
      }
      return chunks;
    }
  },
}));

import { ChunkingService } from "./chunking.service";
import type { DocumentSegment } from "./parsers";

describe("ChunkingService", () => {
  let service: ChunkingService;

  beforeEach(() => {
    service = new ChunkingService({ chunkSize: 512, chunkOverlap: 50 });
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should chunk a short text into a single chunk", () => {
    const segments: DocumentSegment[] = [
      { text: "This is a short document.", pageOrSection: "Intro" },
    ];
    const chunks = service.chunkSegments(segments);
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain("short document");
    expect(chunks[0].pageOrSection).toBe("Intro");
    expect(chunks[0].chunkIndex).toBe(0);
  });

  it("should produce multiple chunks for long text", () => {
    // Generate a long text (~2000 words)
    const longText = Array(400).fill("The quick brown fox jumps over the lazy dog.").join(" ");
    const segments: DocumentSegment[] = [
      { text: longText, pageOrSection: "Page 1" },
    ];
    const chunks = service.chunkSegments(segments);
    expect(chunks.length).toBeGreaterThan(1);
    // All chunks should reference the same section
    for (const chunk of chunks) {
      expect(chunk.pageOrSection).toBe("Page 1");
    }
  });

  it("should assign sequential chunk indices across segments", () => {
    const segments: DocumentSegment[] = [
      { text: "First section content here.", pageOrSection: "Section 1" },
      { text: "Second section content here.", pageOrSection: "Section 2" },
    ];
    const chunks = service.chunkSegments(segments);
    expect(chunks.length).toBe(2);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[1].chunkIndex).toBe(1);
  });

  it("should skip empty segments", () => {
    const segments: DocumentSegment[] = [
      { text: "", pageOrSection: "Empty" },
      { text: "   ", pageOrSection: "Whitespace" },
      { text: "Real content.", pageOrSection: "Content" },
    ];
    const chunks = service.chunkSegments(segments);
    expect(chunks.length).toBe(1);
    expect(chunks[0].pageOrSection).toBe("Content");
  });

  it("should work with chunkText convenience method", () => {
    const chunks = service.chunkText("Hello world, this is a test.");
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain("Hello world");
  });
});

