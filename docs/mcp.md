# Agent Access via MCP

A **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server
exposes this project's search and decision-router core as agent tools, built with
the official TypeScript SDK (`@modelcontextprotocol/sdk`).

The MCP layer is a set of **thin adapters** over existing functions in `src/`
(`searchPages`, `routeDecision`). No business logic lives in `src/mcp/`; the
adapters validate input, call the existing function, and return its
already-shaped result with provenance (`id` / `source_file` / `score`) intact.

## Layout

| File | Responsibility |
|---|---|
| `src/mcp/tools.ts` | Pure async tool logic (`searchTool`, `routeDecisionTool`). Plain functions taking explicit deps — unit-testable without live Elasticsearch. Zod-validated input. |
| `src/mcp/server.ts` | Thin SDK server (`ai-search-decision-lab`) registering the two tools over **stdio**. |
| `src/mcp/errors.ts` | Structured result/error contract and a `guard` wrapper mapping thrown errors to categories. |

## Tools

### `search`

Search the indexed AI-search decision-guide pages. Wraps `searchPages` in `src/search.ts`.

**Input**

| Field | Type | Default | Notes |
|---|---|---|---|
| `query` | string (non-empty) | — | required |
| `strategy` | `"baseline_body_title"` \| `"enriched_metadata"` \| `"decision_router"` | `enriched_metadata` | the three real strategies |
| `size` | integer 1–10 | 3 | number of hits |

**Success output** (`structuredContent`)

```json
{
  "isError": false,
  "query": "When should I use RRF instead of linear retriever weighting?",
  "strategy": "decision_router",
  "count": 3,
  "results": [
    {
      "id": "page-hybrid-reranking",
      "title": "Hybrid retrieval and reranking",
      "score": 14.2,
      "decision_stage": "hybrid_reranking",
      "source_file": "content/pages/hybrid-reranking.md"
    }
  ]
}
```

An empty `results` array is a **normal, successful** outcome — not an error.
Requires a live Elasticsearch (see project README); without it the tool returns a
retryable `transient` error rather than a stack trace.

### `route_decision`

Deterministically map a query to one of six `DecisionStage`s plus its topics.
Wraps the pure regex router `routeDecision` in `src/decisionRouter.ts`. No network.

**Input**

| Field | Type | Notes |
|---|---|---|
| `query` | string (non-empty) | required |

**Success output** (`structuredContent`)

```json
{
  "isError": false,
  "query": "add semantic search to an existing BM25 index without downtime",
  "decision_stage": "semantic_migration",
  "topics": ["semantic reranking", "reindex", "alias swap", "BM25 migration"]
}
```

The same input always yields the same output (deterministic).

## Error contract

On failure a tool returns a structured payload **in place of** a result — never a
raised exception or a stack trace:

```json
{
  "isError": true,
  "errorCategory": "validation" | "transient" | "business",
  "isRetryable": false,
  "message": "<safe, human-readable summary>",
  "details": { }
}
```

| Category | When | Retryable |
|---|---|---|
| `validation` | bad input (empty query, unknown strategy, out-of-range `size`) | no |
| `transient` | Elasticsearch unreachable / timeout, or an unexpected internal error | connectivity: yes; unexpected: no |
| `business` | a valid request that cannot be satisfied as asked | no |

The MCP tool-result `isError` flag is set to match, so SDK clients see the failure.

## Run

```bash
npm install
npm run mcp        # tsx src/mcp/server.ts — stdio transport
```

The server speaks JSON-RPC over stdio; it is meant to be launched by an MCP
client, not used interactively.

## Client registration

Example registration for a Claude Code / Claude Desktop style `mcpServers` config:

```json
{
  "mcpServers": {
    "ai-search-decision-lab": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/elastic-ai-search-decision-lab",
      "env": { "ELASTICSEARCH_URL": "http://localhost:9200" }
    }
  }
}
```

`ELASTICSEARCH_URL` defaults to `http://localhost:9200`. The `search` tool needs a
running, indexed Elasticsearch (`docker compose up -d && npm run index`);
`route_decision` runs without any backend.

## Example raw call

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"c","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"route_decision","arguments":{"query":"vector search is slow and memory heavy"}}}' \
  | npm run -s mcp
```

returns `decision_stage: "vector_tuning"`.
