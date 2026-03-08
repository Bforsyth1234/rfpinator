// Mock ESM-only dependencies
jest.mock("uuid", () => ({ v4: () => "test-uuid" }));
jest.mock("llamaindex", () => ({
  OpenAIEmbedding: class {
    getTextEmbedding() { return Promise.resolve([0.1]); }
    getTextEmbeddings(t: string[]) { return Promise.resolve(t.map(() => [0.1])); }
  },
}));
jest.mock("chromadb", () => ({ ChromaClient: class {} }));

import { EvaluationService } from "./evaluation.service";
import { JudgeService, JudgeResult } from "./judge.service";
import { QueryService } from "../query/query.service";
import type { RagQueryResponse, GoldenDatasetEntry } from "@rfpinator/shared";

describe("EvaluationService", () => {
  let service: EvaluationService;
  let queryService: Partial<QueryService>;
  let judgeService: Partial<JudgeService>;

  const mockRagResponse: RagQueryResponse = {
    answer: "MFA is required for all users.",
    citations: [{ source: "access-policy.md", text: "All users must use MFA." }],
    confidenceScore: 0.9,
    model: "groq",
    retrievedChunks: [
      { text: "All users must use MFA.", source: "access-policy.md", score: 0.85 },
    ],
    answerable: true,
  };

  const mockScores: JudgeResult = {
    retrievalScore: 4,
    faithfulnessScore: 5,
    judgeSystemPrompt: "mock judge system prompt",
    judgeUserMessage: "mock judge user message",
  };

  const sampleDataset: GoldenDatasetEntry[] = [
    {
      question: "Is MFA required?",
      expectedAnswer: "Yes, MFA is required for all users.",
      expectedSources: ["access-policy.md"],
    },
    {
      question: "What is the password length?",
      expectedAnswer: "12 characters minimum.",
      expectedSources: ["password-policy.md"],
    },
  ];

  beforeEach(() => {
    queryService = {
      query: jest.fn().mockResolvedValue(mockRagResponse),
    };
    judgeService = {
      score: jest.fn().mockResolvedValue(mockScores),
    };
    service = new EvaluationService(
      queryService as QueryService,
      judgeService as JudgeService,
    );
  });

  describe("evaluate", () => {
    it("should evaluate all dataset entries and return aggregate scores", async () => {
      const summary = await service.evaluate(sampleDataset);

      expect(summary.totalQuestions).toBe(2);
      expect(summary.avgRetrieval).toBe(4);
      expect(summary.avgFaithfulness).toBe(5);
      expect(summary.results).toHaveLength(2);
      expect(queryService.query).toHaveBeenCalledTimes(2);
      expect(judgeService.score).toHaveBeenCalledTimes(2);
    });

    it("should pass provider option to query service", async () => {
      await service.evaluate(sampleDataset, { provider: "openai" });

      expect(queryService.query).toHaveBeenCalledWith(
        expect.objectContaining({ model_choice: "openai" }),
      );
    });

    it("should handle query failures gracefully with score 1", async () => {
      (queryService.query as jest.Mock)
        .mockResolvedValueOnce(mockRagResponse)
        .mockRejectedValueOnce(new Error("Connection refused"));

      const summary = await service.evaluate(sampleDataset);

      expect(summary.totalQuestions).toBe(2);
      expect(summary.results[1].faithfulnessScore).toBe(1);
      expect(summary.results[1].retrievalScore).toBe(1);
      expect(summary.results[1].generatedAnswer).toContain("[ERROR]");
    });

    it("should map RAG response fields to eval result correctly", async () => {
      const summary = await service.evaluate([sampleDataset[0]]);
      const result = summary.results[0];

      expect(result.question).toBe("Is MFA required?");
      expect(result.generatedAnswer).toBe("MFA is required for all users.");
      expect(result.expectedAnswer).toBe("Yes, MFA is required for all users.");
      expect(result.citedSources).toEqual(["access-policy.md"]);
      expect(result.expectedSources).toEqual(["access-policy.md"]);
    });
  });

  describe("loadDataset", () => {
    it("should throw on non-existent file", () => {
      expect(() => service.loadDataset("/nonexistent/path.json")).toThrow();
    });

    it("should load the sample golden dataset", () => {
      // Resolve from repo root (jest rootDir is apps/api/src)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const datasetPath = require("path").resolve(__dirname, "../../../../data/golden_dataset.json");
      const entries = service.loadDataset(datasetPath);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0]).toHaveProperty("question");
      expect(entries[0]).toHaveProperty("expectedAnswer");
      expect(entries[0]).toHaveProperty("expectedSources");
    });
  });
});

