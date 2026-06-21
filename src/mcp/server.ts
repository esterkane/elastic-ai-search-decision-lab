/**
 * Read-only MCP server exposing the search + decision-router core as agent tools.
 *
 * This file is a THIN adapter: it registers two tools with the official
 * TypeScript MCP SDK and delegates all logic to the pure functions in
 * `src/mcp/tools.ts`, which in turn wrap the existing `searchPages` and
 * `routeDecision` functions in `src/`. No business logic lives here.
 *
 * Transport: stdio. Run via `npm run mcp`.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  searchTool,
  routeDecisionTool,
  searchInputSchema,
  routeDecisionInputSchema,
  SEARCH_STRATEGIES,
  DEFAULT_STRATEGY
} from "./tools.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "ai-search-decision-lab",
    version: "0.1.0"
  });

  server.registerTool(
    "search",
    {
      title: "Search AI-search decision pages",
      description:
        "Search the indexed AI-search decision-guide pages and return ranked results " +
        `with provenance (id, source_file, score, decision_stage). Strategies: ${SEARCH_STRATEGIES.join(
          ", "
        )} (default: ${DEFAULT_STRATEGY}). Read-only; an empty result set is normal.`,
      inputSchema: searchInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: true }
    },
    async (args) => {
      const result = await searchTool(args);
      return {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: result.isError === true
      };
    }
  );

  server.registerTool(
    "route_decision",
    {
      title: "Route a query to a decision stage",
      description:
        "Deterministically map a query to one of six DecisionStages plus its topics " +
        "using the regex-based decision router. Pure and read-only; no network access.",
      inputSchema: routeDecisionInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async (args) => {
      const result = await routeDecisionTool(args);
      return {
        structuredContent: result,
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: result.isError === true
      };
    }
  );

  return server;
}

export async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
