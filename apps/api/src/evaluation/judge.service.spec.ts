jest.mock("uuid", () => ({ v4: () => "test-uuid" }));
jest.mock("llamaindex", () => ({
  OpenAIEmbedding: class {
    getTextEmbedding() { return Promise.resolve([0.1]); }
    getTextEmbeddings(t: string[]) { return Promise.resolve(t.map(() => [0.1])); }
  },
}));
jest.mock("chromadb", () => ({ ChromaClient: class {} }));

import { JudgeService } from "./judge.service";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe("JudgeService", () => {
  let service: JudgeService;

  beforeEach(() => {
    service = new JudgeService({ apiKey: "test-key", model: "text-embedding-3-small" });
    mockFetch.mockReset();
  });

  const scoreParams = {
    question: "Is MFA required?",
    expectedAnswer: "Yes, MFA is required.",
    generatedAnswer: "MFA is required for all users.",
    retrievedContext: "[Chunk 1] All users must use MFA.",
    expectedSources: ["access-policy.md"],
    citedSources: ["access-policy.md"],
  };

  it("should return parsed scores from GPT-4o response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  retrievalScore: 5,
                  faithfulnessScore: 4,
                }),
              },
            },
          ],
        }),
    });

    const scores = await service.score(scoreParams);

    expect(scores.retrievalScore).toBe(5);
    expect(scores.faithfulnessScore).toBe(4);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      }),
    );
  });

  it("should clamp scores to 1-5 range", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  retrievalScore: 10,
                  faithfulnessScore: -1,
                }),
              },
            },
          ],
        }),
    });

    const scores = await service.score(scoreParams);
    expect(scores.retrievalScore).toBe(5);
    expect(scores.faithfulnessScore).toBe(1);
  });

  it("should default to score 1 on parse failure", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "not valid json" } }],
        }),
    });

    const scores = await service.score(scoreParams);
    expect(scores.retrievalScore).toBe(1);
    expect(scores.faithfulnessScore).toBe(1);
  });

  it("should throw on API error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(service.score(scoreParams)).rejects.toThrow(
      "OpenAI judge API error (401): Unauthorized",
    );
  });

  it("should throw on empty response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "" } }] }),
    });

    await expect(service.score(scoreParams)).rejects.toThrow(
      "GPT-4o judge returned empty response",
    );
  });
});

