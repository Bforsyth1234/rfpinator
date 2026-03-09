jest.mock("llamaindex", () => ({
  OpenAIEmbedding: class MockOpenAIEmbedding {
    getTextEmbedding(text: string): Promise<number[]> {
      return mockGetTextEmbedding(text);
    }

    getTextEmbeddings(texts: string[]): Promise<number[][]> {
      return mockGetTextEmbeddings(texts);
    }
  },
}));

import { BadRequestException } from "@nestjs/common";
import { EmbeddingService } from "./embedding.service";

const mockGetTextEmbedding = jest.fn<Promise<number[]>, [string]>();
const mockGetTextEmbeddings = jest.fn<Promise<number[][]>, [string[]]>();

describe("EmbeddingService", () => {
  let service: EmbeddingService;

  beforeEach(() => {
    mockGetTextEmbedding.mockReset();
    mockGetTextEmbeddings.mockReset();
    mockGetTextEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockGetTextEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);

    service = new EmbeddingService({
      apiKey: "test-key",
      model: "text-embedding-3-small",
    });
  });

  it("should reject blank text before calling the embedding model", async () => {
    const result = service.embedText("   ");
    await expect(result).rejects.toThrow(BadRequestException);
    await expect(result).rejects.toThrow(
      "Embedding text must be a non-empty string.",
    );
    expect(mockGetTextEmbedding).not.toHaveBeenCalled();
  });

  it("should reject batches containing blank entries", async () => {
    const result = service.embedTexts(["valid", ""]);
    await expect(result).rejects.toThrow(BadRequestException);
    await expect(result).rejects.toThrow(
      "Embedding text at index 1 must be a non-empty string.",
    );
    expect(mockGetTextEmbeddings).not.toHaveBeenCalled();
  });

  it("should delegate valid text to the embedding model", async () => {
    await expect(service.embedText("What is the password policy?")).resolves.toEqual([
      0.1,
      0.2,
      0.3,
    ]);
    expect(mockGetTextEmbedding).toHaveBeenCalledWith(
      "What is the password policy?",
    );
  });
});