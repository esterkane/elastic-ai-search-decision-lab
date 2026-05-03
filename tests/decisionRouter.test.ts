import { describe, expect, it } from "vitest";
import { routeDecision } from "../src/decisionRouter.js";

describe("decisionRouter", () => {
  it.each([
    ["Should I use BM25 or semantic search?", "retrieval_strategy"],
    ["How do I choose semantic_text vs inference API?", "semantic_implementation"],
    ["When should I use RRF instead of linear retriever weighting?", "hybrid_reranking"],
    ["Vector search is slow and memory heavy", "vector_tuning"],
    ["Which metric should I use for graded judgments?", "retrieval_evaluation"],
    ["Add semantic search to an existing BM25 index without downtime", "semantic_migration"]
  ] as const)("maps %s to %s", (query, expectedStage) => {
    expect(routeDecision(query).decision_stage).toBe(expectedStage);
  });
});
