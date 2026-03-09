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

  it("should return parsed scores from judge response", async () => {
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
                  answerScore: 5,
                  reasoning: "Retrieved context covers MFA requirement well.",
                }),
              },
            },
          ],
        }),
    });

    const scores = await service.score(scoreParams);

    expect(scores.retrievalScore).toBe(5);
    expect(scores.faithfulnessScore).toBe(4);
    expect(scores.answerScore).toBe(5);
    expect(scores.reasoning).toBe("Retrieved context covers MFA requirement well.");
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
                  answerScore: 0,
                }),
              },
            },
          ],
        }),
    });

    const scores = await service.score(scoreParams);
    expect(scores.retrievalScore).toBe(5);
    expect(scores.faithfulnessScore).toBe(1);
    expect(scores.answerScore).toBe(1);
    expect(scores.reasoning).toBe("");
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
    expect(scores.answerScore).toBe(1);
    expect(scores.reasoning).toBe("");
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
      "GPT-4.1 judge returned empty response",
    );
  });

  it("should use custom system prompt when provided", async () => {
    const customPrompt = "You are a custom judge. Return JSON.";
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  retrievalScore: 4,
                  faithfulnessScore: 3,
                  answerScore: 4,
                  reasoning: "Custom judge reasoning.",
                }),
              },
            },
          ],
        }),
    });

    const result = await service.score({ ...scoreParams, systemPrompt: customPrompt });

    expect(result.retrievalScore).toBe(4);
    expect(result.faithfulnessScore).toBe(3);
    expect(result.judgeSystemPrompt).toBe(customPrompt);

    // Verify the custom prompt was sent in the API call
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.messages[0].content).toBe(customPrompt);
  });

  it("should use default prompt when no custom prompt provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  retrievalScore: 5,
                  faithfulnessScore: 5,
                  answerScore: 5,
                  reasoning: "Perfect match.",
                }),
              },
            },
          ],
        }),
    });

    const result = await service.score(scoreParams);

    // Should use the default JUDGE_SYSTEM_PROMPT
    expect(result.judgeSystemPrompt).toContain("expert evaluation judge");
    expect(result.reasoning).toBe("Perfect match.");
  });
});

