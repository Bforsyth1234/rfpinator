// Mock ESM-only dependencies
jest.mock("uuid", () => ({
  v4: () => "test-uuid-1234",
}));

jest.mock("llamaindex", () => ({
  OpenAIEmbedding: class MockOpenAIEmbedding {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getTextEmbedding(_text: string): Promise<number[]> {
      return Promise.resolve([0.1, 0.2, 0.3]);
    }
    getTextEmbeddings(texts: string[]): Promise<number[][]> {
      return Promise.resolve(texts.map(() => [0.1, 0.2, 0.3]));
    }
  },
}));

jest.mock("chromadb", () => ({
  ChromaClient: class MockChromaClient {},
}));

import { BadRequestException } from "@nestjs/common";
import { QueryService } from "./query.service";
import { EmbeddingService } from "../ingestion/embedding.service";
import { VectorStoreService } from "../ingestion/vector-store.service";
import { GroqProvider } from "./providers/groq.provider";
import { OpenAiProvider } from "./providers/openai.provider";
import type { LlmStructuredResponse } from "./providers";

const mockColumnDetection = {
  headerRowIndex: 0,
  questionColumnIndex: 1,
  answerColumnIndex: 2,
};

type MockCollection = {
  query: jest.Mock;
};

describe("QueryService", () => {
  let service: QueryService;
  let embedder: Partial<EmbeddingService>;
  let vectorStore: Partial<VectorStoreService>;
  let groqProvider: Partial<GroqProvider>;
  let openAiProvider: Partial<OpenAiProvider>;
  let mockCollection: MockCollection;

  const mockLlmResponse: LlmStructuredResponse = {
    answer: "MFA is required for all users per the access control policy.",
    citation: "access-policy.md - Access Control section",
    confidence_score: 0.92,
    answerable: true,
  };

  beforeEach(() => {
    mockCollection = {
      query: jest.fn().mockResolvedValue({
        documents: [["All users must use MFA.", "Passwords must be 12+ chars."]],
        metadatas: [
          [
            { source: "access-policy.md", pageOrSection: "Access Control", chunkIndex: 0, documentId: "doc-1" },
            { source: "password-policy.md", pageOrSection: "Requirements", chunkIndex: 0, documentId: "doc-2" },
          ],
        ],
        distances: [[0.15, 0.35]],
      }),
    };

    embedder = {
      embedText: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    vectorStore = {
      getCollection: jest.fn().mockReturnValue(mockCollection),
    };

    groqProvider = {
      name: "groq",
      generateAnswer: jest.fn().mockResolvedValue(mockLlmResponse),
      generateJson: jest.fn().mockResolvedValue(mockColumnDetection),
    };

    openAiProvider = {
      name: "openai",
      generateAnswer: jest.fn().mockResolvedValue(mockLlmResponse),
      generateJson: jest.fn().mockResolvedValue(mockColumnDetection),
    };

    service = new QueryService(
      { defaultProvider: "groq", topK: 5, openaiModel: "gpt-4o-mini", distanceThreshold: 1.0 },
      embedder as EmbeddingService,
      vectorStore as VectorStoreService,
      groqProvider as GroqProvider,
      openAiProvider as OpenAiProvider,
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("query", () => {
    it("should return structured RAG response with default provider", async () => {
      const result = await service.query({ question: "Is MFA required?" });

      expect(result.answer).toBe(mockLlmResponse.answer);
      expect(result.confidenceScore).toBe(0.92);
      expect(result.model).toBe("groq");
      expect(result.citations).toHaveLength(2);
      expect(result.citations[0].source).toBe("access-policy.md");
      expect(result.retrievedChunks).toHaveLength(2);
    });

    it("should embed the question for similarity search", async () => {
      await service.query({ question: "What is the password policy?" });

      expect(embedder.embedText).toHaveBeenCalledWith(
        "What is the password policy?",
      );
    });

    it("should query ChromaDB with the embedded question", async () => {
      await service.query({ question: "Test question" });

      expect(mockCollection.query).toHaveBeenCalledWith({
        queryEmbeddings: [[0.1, 0.2, 0.3]],
        nResults: 5,
      });
    });

    it("should use model_choice to select provider", async () => {
      await service.query({
        question: "Test",
        model_choice: "openai",
      });

      expect(openAiProvider.generateAnswer).toHaveBeenCalled();
      expect(groqProvider.generateAnswer).not.toHaveBeenCalled();
    });

    it("should fall back to model field when model_choice is absent", async () => {
      await service.query({
        question: "Test",
        model: "openai",
      });

      expect(openAiProvider.generateAnswer).toHaveBeenCalled();
    });

    it("should return empty response when no chunks are retrieved", async () => {
      mockCollection.query.mockResolvedValue({
        documents: [[]],
        metadatas: [[]],
        distances: [[]],
      });

      const result = await service.query({ question: "Unknown topic" });

      expect(result.answer).toContain("No relevant context");
      expect(result.confidenceScore).toBe(0);
      expect(result.citations).toHaveLength(0);
    });

    it("should throw on unknown provider", async () => {
      await expect(
        service.query({ question: "Test", model_choice: "unknown-provider" }),
      ).rejects.toThrow('Unknown LLM provider: "unknown-provider"');
    });

    it.each(["", "   "])(
      "should reject blank question input %p before embedding",
      async (question) => {
        const result = service.query({ question });
        await expect(result).rejects.toThrow(BadRequestException);
        await expect(result).rejects.toThrow(
          "Question must be a non-empty string.",
        );
        expect(embedder.embedText).not.toHaveBeenCalled();
      },
    );

    it("should deduplicate citations by source", async () => {
      mockCollection.query.mockResolvedValue({
        documents: [["Chunk 1 from policy", "Chunk 2 from same policy"]],
        metadatas: [
          [
            { source: "same-policy.md", pageOrSection: "Section A" },
            { source: "same-policy.md", pageOrSection: "Section B" },
          ],
        ],
        distances: [[0.1, 0.2]],
      });

      const result = await service.query({ question: "Test" });
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].source).toBe("same-policy.md");
    });

    it("should populate citation.page for PDF page metadata", async () => {
      mockCollection.query.mockResolvedValue({
        documents: [["Content from a PDF page."]],
        metadatas: [
          [{ source: "report.pdf", pageOrSection: "Page 5", chunkIndex: 0, documentId: "doc-3" }],
        ],
        distances: [[0.1]],
      });

      const result = await service.query({ question: "Test" });
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].page).toBe(5);
    });

    it("should leave citation.page undefined for markdown section metadata", async () => {
      mockCollection.query.mockResolvedValue({
        documents: [["Content from a markdown section."]],
        metadatas: [
          [{ source: "policy.md", pageOrSection: "Access Control", chunkIndex: 0, documentId: "doc-4" }],
        ],
        distances: [[0.1]],
      });

      const result = await service.query({ question: "Test" });
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].page).toBeUndefined();
    });

    it("should filter out chunks exceeding distance threshold", async () => {
      // Return 3 chunks with increasing distance
      mockCollection.query.mockResolvedValue({
        documents: [["Close chunk", "Medium chunk", "Far chunk"]],
        metadatas: [
          [
            { source: "policy-a.md", pageOrSection: "Section A" },
            { source: "policy-b.md", pageOrSection: "Section B" },
            { source: "policy-c.md", pageOrSection: "Section C" },
          ],
        ],
        distances: [[0.2, 0.5, 1.5]],
      });

      // Strict threshold: only keep chunks with distance <= 0.6
      const strictService = new QueryService(
        { defaultProvider: "groq", topK: 5, openaiModel: "gpt-4o-mini", distanceThreshold: 0.6 },
        embedder as EmbeddingService,
        vectorStore as VectorStoreService,
        groqProvider as GroqProvider,
        openAiProvider as OpenAiProvider,
      );

      const result = await strictService.query({ question: "Test" });

      // Should only have the 2 chunks within threshold (0.2 and 0.5)
      expect(result.retrievedChunks).toHaveLength(2);
      expect(result.retrievedChunks[0].source).toBe("policy-a.md");
      expect(result.retrievedChunks[1].source).toBe("policy-b.md");
    });

    it("should keep all chunks when distance threshold is 0 (disabled)", async () => {
      mockCollection.query.mockResolvedValue({
        documents: [["Close chunk", "Far chunk"]],
        metadatas: [
          [
            { source: "policy-a.md", pageOrSection: "Section A" },
            { source: "policy-b.md", pageOrSection: "Section B" },
          ],
        ],
        distances: [[0.2, 99.0]],
      });

      const noFilterService = new QueryService(
        { defaultProvider: "groq", topK: 5, openaiModel: "gpt-4o-mini", distanceThreshold: 0 },
        embedder as EmbeddingService,
        vectorStore as VectorStoreService,
        groqProvider as GroqProvider,
        openAiProvider as OpenAiProvider,
      );

      const result = await noFilterService.query({ question: "Test" });
      expect(result.retrievedChunks).toHaveLength(2);
    });

    it("should return no-context response when all chunks are filtered out", async () => {
      mockCollection.query.mockResolvedValue({
        documents: [["Far chunk"]],
        metadatas: [[{ source: "policy.md", pageOrSection: "S1" }]],
        distances: [[2.0]],
      });

      const veryStrictService = new QueryService(
        { defaultProvider: "groq", topK: 5, openaiModel: "gpt-4o-mini", distanceThreshold: 0.3 },
        embedder as EmbeddingService,
        vectorStore as VectorStoreService,
        groqProvider as GroqProvider,
        openAiProvider as OpenAiProvider,
      );

      const result = await veryStrictService.query({ question: "Test" });
      expect(result.answer).toContain("No relevant context");
      expect(result.retrievedChunks).toHaveLength(0);
      expect(groqProvider.generateAnswer).not.toHaveBeenCalled();
    });
  });

  describe("getAvailableProviders", () => {
    it("should return groq and openai", () => {
      const providers = service.getAvailableProviders();
      expect(providers).toContain("groq");
      expect(providers).toContain("openai");
    });
  });

  describe("detectQuestionnaireColumns", () => {
    it("should use the selected provider for AI column detection", async () => {
      const result = await service.detectQuestionnaireColumns({
        fileName: "questionnaire.xlsx",
        rows: [
          ["ID", "Question", "Answer"],
          ["1", "Do you use MFA?", ""],
        ],
        model_choice: "openai",
      });

      expect(openAiProvider.generateJson).toHaveBeenCalled();
      expect(result).toEqual(mockColumnDetection);
    });

    it("should fall back to heuristic detection when the model response fails", async () => {
      groqProvider.generateJson = jest.fn().mockRejectedValue(new Error("bad json"));

      const result = await service.detectQuestionnaireColumns({
        fileName: "questionnaire.xlsx",
        rows: [
          ["Control ID", "Question Text", "Response"],
          ["AC-1", "Is MFA required for admins?", ""],
        ],
      });

      expect(result.headerRowIndex).toBe(0);
      expect(result.questionColumnIndex).toBe(1);
      expect(result.answerColumnIndex).toBe(2);
    });

    it("should reject empty questionnaire samples", async () => {
      await expect(
        service.detectQuestionnaireColumns({ rows: [] }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

