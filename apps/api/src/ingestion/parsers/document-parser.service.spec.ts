import { DocumentParserService } from "./document-parser.service";

describe("DocumentParserService", () => {
  let service: DocumentParserService;

  beforeEach(() => {
    service = new DocumentParserService();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("parseMarkdownBuffer", () => {
    it("should parse simple markdown into segments", () => {
      const md = `# Introduction
This is the intro.

## Policy A
Policy A details here.

## Policy B
Policy B details here.`;

      const result = service.parseMarkdownBuffer(md, "test.md");
      expect(result.filename).toBe("test.md");
      expect(result.mimeType).toBe("text/markdown");
      expect(result.segments.length).toBe(3);
      expect(result.segments[0].pageOrSection).toBe("Introduction");
      expect(result.segments[1].pageOrSection).toBe("Policy A");
      expect(result.segments[2].pageOrSection).toBe("Policy B");
    });

    it("should handle markdown without headings", () => {
      const md = "Just plain text without any headings.";
      const result = service.parseMarkdownBuffer(md, "plain.md");
      expect(result.segments.length).toBe(1);
      expect(result.segments[0].pageOrSection).toBe("Introduction");
    });

    it("should handle empty markdown", () => {
      const result = service.parseMarkdownBuffer("", "empty.md");
      expect(result.segments.length).toBe(1);
      expect(result.segments[0].pageOrSection).toBe("Document");
    });

    it("should preserve nested heading levels", () => {
      const md = `# Top
Top content.

### Deep Heading
Deep content.`;

      const result = service.parseMarkdownBuffer(md, "nested.md");
      expect(result.segments.length).toBe(2);
      expect(result.segments[0].pageOrSection).toBe("Top");
      expect(result.segments[1].pageOrSection).toBe("Deep Heading");
    });
  });

  describe("parseBuffer", () => {
    it("should route markdown buffers correctly", async () => {
      const buffer = Buffer.from("# Test\nContent here.");
      const result = await service.parseBuffer(buffer, "test.md");
      expect(result.mimeType).toBe("text/markdown");
      expect(result.segments.length).toBeGreaterThan(0);
    });
  });

  describe("getSupportedExtensions", () => {
    it("should return supported extensions", () => {
      const exts = service.getSupportedExtensions();
      expect(exts).toContain(".md");
      expect(exts).toContain(".pdf");
      expect(exts).toContain(".markdown");
    });
  });
});

