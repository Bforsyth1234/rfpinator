// Mock ESM-only dependencies
jest.mock("uuid", () => ({
  v4: () => "test-uuid-1234",
}));

jest.mock("llamaindex", () => ({
  SentenceSplitter: class MockSentenceSplitter {
    splitText(text: string): string[] {
      if (text.length <= 200) return [text];
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += 150) {
        chunks.push(text.slice(i, i + 200));
      }
      return chunks;
    }
  },
}));

import { IngestionService } from "./ingestion.service";
import { DocumentParserService } from "./parsers";
import { ChunkingService } from "./chunking.service";
import { EmbeddingService } from "./embedding.service";
import { VectorStoreService } from "./vector-store.service";

describe("IngestionService", () => {
  let service: IngestionService;
  let parser: DocumentParserService;
  let chunker: ChunkingService;
  let embedder: Partial<EmbeddingService>;
  let vectorStore: Partial<VectorStoreService>;

  beforeEach(() => {
    parser = new DocumentParserService();
    chunker = new ChunkingService({ chunkSize: 512, chunkOverlap: 50 });

    embedder = {
      embedTexts: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    };

    vectorStore = {
      addChunks: jest.fn().mockResolvedValue(["chunk-id-1"]),
    };

    service = new IngestionService(
      parser,
      chunker,
      embedder as EmbeddingService,
      vectorStore as VectorStoreService,
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("ingestBuffer", () => {
    it("should ingest a markdown buffer end-to-end", async () => {
      const buffer = Buffer.from("# Policy\nThis is a security policy document.");
      const result = await service.ingestBuffer(buffer, "policy.md");

      expect(result.status).toBe("success");
      expect(result.chunksCreated).toBeGreaterThan(0);
      expect(result.documentId).toBeDefined();
      expect(embedder.embedTexts).toHaveBeenCalledTimes(1);
      expect(vectorStore.addChunks).toHaveBeenCalledTimes(1);
    });

    it("should handle empty content gracefully", async () => {
      const buffer = Buffer.from("");
      const result = await service.ingestBuffer(buffer, "empty.md");

      // Empty markdown still produces a segment with "Document" section
      // but the text is empty, so no chunks
      expect(result.status).toBe("success");
    });

    it("should return error status on failure", async () => {
      (embedder.embedTexts as jest.Mock).mockRejectedValue(
        new Error("API key invalid"),
      );
      const buffer = Buffer.from("# Test\nContent.");
      const result = await service.ingestBuffer(buffer, "test.md");

      expect(result.status).toBe("error");
      expect(result.message).toContain("API key invalid");
      expect(result.chunksCreated).toBe(0);
    });
  });

  describe("ingestBuffer with citation metadata", () => {
    it("should pass correct filename and metadata to vector store", async () => {
      const buffer = Buffer.from("# Access Control\nAll users must use MFA.");
      await service.ingestBuffer(buffer, "access-policy.md");

      expect(vectorStore.addChunks).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            pageOrSection: "Access Control",
          }),
        ]),
        expect.any(Array),
        expect.any(String),
        "access-policy.md",
      );
    });
  });
});

