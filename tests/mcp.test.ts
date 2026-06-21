import { describe, expect, it, vi } from "vitest";
import {
  searchTool,
  routeDecisionTool,
  DEFAULT_STRATEGY,
  SEARCH_STRATEGIES
} from "../src/mcp/tools.js";
import type { SearchFn } from "../src/mcp/tools.js";
import type { SearchResult } from "../src/types.js";

const sampleResult: SearchResult = {
  id: "page-rrf",
  title: "RRF vs linear retriever",
  score: 12.5,
  decision_stage: "hybrid_reranking",
  source_file: "content/pages/hybrid-reranking.md"
};

/** A fake search dep — no live Elasticsearch. */
function fakeSearch(results: SearchResult[] = [sampleResult]): SearchFn {
  return vi.fn(async () => results);
}

describe("searchTool", () => {
  it("returns the existing SearchResult shape with provenance preserved", async () => {
    const search = fakeSearch();
    const result = await searchTool({ query: "RRF" }, { search });

    expect(result.isError).toBe(false);
    if (result.isError) return;

    expect(result.strategy).toBe(DEFAULT_STRATEGY);
    expect(result.count).toBe(1);
    expect(result.results[0]).toEqual(sampleResult);
    // provenance fields are intact
    expect(result.results[0]).toHaveProperty("id");
    expect(result.results[0]).toHaveProperty("source_file");
    expect(result.results[0]).toHaveProperty("score");
  });

  it("passes each real strategy through to the search dep", async () => {
    for (const strategy of SEARCH_STRATEGIES) {
      const search = fakeSearch();
      const result = await searchTool({ query: "vector tuning", strategy }, { search });

      expect(result.isError).toBe(false);
      if (result.isError) return;
      expect(result.strategy).toBe(strategy);
      expect(search).toHaveBeenCalledWith("vector tuning", strategy, expect.any(Number));
    }
  });

  it("treats an empty result set as a normal success (not an error)", async () => {
    const search = fakeSearch([]);
    const result = await searchTool({ query: "no matches here" }, { search });

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.count).toBe(0);
    expect(result.results).toEqual([]);
  });

  it("rejects an invalid strategy with a validation error", async () => {
    const search = fakeSearch();
    const result = await searchTool(
      { query: "RRF", strategy: "semantic_only" },
      { search }
    );

    expect(result.isError).toBe(true);
    if (!result.isError) return;
    expect(result.errorCategory).toBe("validation");
    expect(result.isRetryable).toBe(false);
    expect(search).not.toHaveBeenCalled();
  });

  it("rejects an empty query with a validation error", async () => {
    const search = fakeSearch();
    const result = await searchTool({ query: "   " }, { search });

    expect(result.isError).toBe(true);
    if (!result.isError) return;
    expect(result.errorCategory).toBe("validation");
    expect(search).not.toHaveBeenCalled();
  });

  it("maps a thrown backend connection error to a retryable transient error", async () => {
    const search: SearchFn = vi.fn(async () => {
      const err = new Error("connect ECONNREFUSED");
      err.name = "ConnectionError";
      throw err;
    });
    const result = await searchTool({ query: "RRF" }, { search });

    expect(result.isError).toBe(true);
    if (!result.isError) return;
    expect(result.errorCategory).toBe("transient");
    expect(result.isRetryable).toBe(true);
    // no stack trace leaked
    expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
  });
});

describe("routeDecisionTool", () => {
  it("returns a decision stage deterministically via the real router", async () => {
    const first = await routeDecisionTool({
      query: "When should I use RRF instead of linear retriever weighting?"
    });
    const second = await routeDecisionTool({
      query: "When should I use RRF instead of linear retriever weighting?"
    });

    expect(first.isError).toBe(false);
    if (first.isError || second.isError) return;
    expect(first.decision_stage).toBe("hybrid_reranking");
    expect(first.topics.length).toBeGreaterThan(0);
    // deterministic: identical input → identical output
    expect(second).toEqual(first);
  });

  it("falls back to retrieval_strategy when nothing matches", async () => {
    const result = await routeDecisionTool({ query: "hello world unrelated" });
    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.decision_stage).toBe("retrieval_strategy");
  });

  it("rejects an empty query with a validation error", async () => {
    const result = await routeDecisionTool({ query: "" });
    expect(result.isError).toBe(true);
    if (!result.isError) return;
    expect(result.errorCategory).toBe("validation");
    expect(result.isRetryable).toBe(false);
  });
});
