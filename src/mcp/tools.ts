/**
 * MCP tool logic wrapping the search + decision-router core.
 *
 * These are plain, importable async functions — no MCP SDK or transport
 * coupling — so they can be unit-tested directly with a fake search function
 * (no live Elasticsearch). `src/mcp/server.ts` registers thin SDK wrappers that
 * supply the real dependencies.
 *
 * Every handler is wrapped by `guard`, so it either returns a structured
 * success payload or a structured error payload — never a raised exception or a
 * stack trace. These adapters are THIN and READ-ONLY: they validate input, call
 * an existing `src/` function, and return its already-shaped result with
 * provenance (id / source_file / score) preserved. No business logic lives here.
 */

import { z } from "zod";
import { searchPages } from "../search.js";
import { routeDecision } from "../decisionRouter.js";
import type { DecisionIntent } from "../decisionRouter.js";
import type { SearchResult, SearchStrategy } from "../types.js";
import { ToolValidationError, guard, type ToolErrorResult } from "./errors.js";

/** The real strategy names supported by `searchPages`. */
export const SEARCH_STRATEGIES = [
  "baseline_body_title",
  "enriched_metadata",
  "decision_router"
] as const;

/** Documented default strategy (matches `searchPages`'s own default). */
export const DEFAULT_STRATEGY: SearchStrategy = "enriched_metadata";

const MAX_SIZE = 10;
const DEFAULT_SIZE = 3;

/** Signature of the search function the tool depends on (default: `searchPages`). */
export type SearchFn = (
  query: string,
  strategy: SearchStrategy,
  size: number
) => Promise<SearchResult[]>;

/** Signature of the router function the tool depends on (default: `routeDecision`). */
export type RouteFn = (query: string) => DecisionIntent;

export type SearchDeps = { search?: SearchFn };
export type RouteDeps = { route?: RouteFn };

/** Zod schema for the `search` tool input. Exposed for SDK registration. */
export const searchInputSchema = {
  query: z.string().trim().min(1, "`query` must be a non-empty string."),
  strategy: z.enum(SEARCH_STRATEGIES).default(DEFAULT_STRATEGY),
  size: z.number().int().min(1).max(MAX_SIZE).default(DEFAULT_SIZE)
};

const searchInput = z.object(searchInputSchema);

/** Zod schema for the `route_decision` tool input. Exposed for SDK registration. */
export const routeDecisionInputSchema = {
  query: z.string().trim().min(1, "`query` must be a non-empty string.")
};

const routeDecisionInput = z.object(routeDecisionInputSchema);

export type SearchToolResult = {
  isError: false;
  query: string;
  strategy: SearchStrategy;
  count: number;
  results: SearchResult[];
};

export type RouteDecisionToolResult = {
  isError: false;
  query: string;
  decision_stage: DecisionIntent["decision_stage"];
  topics: string[];
};

/**
 * `search` tool: run one of the three real strategies and return the existing
 * `SearchResult[]` shape (id / title / score / decision_stage / source_file).
 * An empty result set is a normal, successful outcome — not an error.
 */
export async function searchTool(
  input: unknown,
  deps: SearchDeps = {}
): Promise<SearchToolResult | ToolErrorResult> {
  return guard("search", async () => {
    const parsed = searchInput.safeParse(input);
    if (!parsed.success) {
      throw new ToolValidationError(parsed.error.issues[0]?.message ?? "Invalid input.", {
        issues: parsed.error.issues
      });
    }
    const { query, strategy, size } = parsed.data;
    const search = deps.search ?? searchPages;
    const results = await search(query, strategy, size);
    return {
      isError: false as const,
      query,
      strategy,
      count: results.length,
      results
    };
  });
}

/**
 * `route_decision` tool: deterministically map a query to a `DecisionStage` plus
 * its topics, via the existing pure `routeDecision` regex router. No network.
 */
export async function routeDecisionTool(
  input: unknown,
  deps: RouteDeps = {}
): Promise<RouteDecisionToolResult | ToolErrorResult> {
  return guard("route_decision", async () => {
    const parsed = routeDecisionInput.safeParse(input);
    if (!parsed.success) {
      throw new ToolValidationError(parsed.error.issues[0]?.message ?? "Invalid input.", {
        issues: parsed.error.issues
      });
    }
    const { query } = parsed.data;
    const route = deps.route ?? routeDecision;
    const intent = route(query);
    return {
      isError: false as const,
      query,
      decision_stage: intent.decision_stage,
      topics: intent.topics
    };
  });
}
