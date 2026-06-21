# CLAUDE.md — elastic-ai-search-decision-lab

Independent portfolio project (not official Elastic docs). A compact TypeScript +
Node.js + Elasticsearch lab for **documentation search quality / findability**. It
parses six AI-search decision-guide Markdown drafts, enriches them with deterministic
metadata, indexes them into Elasticsearch, compares search strategies, and evaluates
findability with practitioner-style judgment queries. No frontend, no chatbot, no RAG,
no external LLM APIs.

## Run / test commands

Requires Node `>=24` (see `package.json` `engines`) and Docker for Elasticsearch.

```bash
npm install                 # install deps
docker compose up -d        # start Elasticsearch 8.15.3 on localhost:9200 (single-node, security off)
npm run setup               # tsx src/elasticsearch.ts setup — (re)create the ai-search-decision-pages index
npm run index               # tsx src/indexDocs.ts — recreate index + bulk-index the 6 Markdown pages
npm run search -- "When should I use RRF instead of linear retriever weighting?"
npm run evaluate            # tsx src/evaluate.ts — writes reports/findability-report.{json,md}
npm test                    # vitest run (unit tests in tests/*.test.ts)
```

Pick a search strategy via env var:

```bash
SEARCH_STRATEGY=decision_router npm run search -- "Can I add semantic search to an existing BM25 index without downtime?"
```
PowerShell: `$env:SEARCH_STRATEGY="decision_router"; npm run search -- "..."`

Notes on what is **real** vs **absent** (do not invent these):
- **Tests:** `npm test` → `vitest run`. Unit tests cover `buildSearchProfile`,
  `decisionRouter`, `metrics`, `parseMarkdown` only. There is **no integration test**
  that hits a live Elasticsearch; `npm run index`/`evaluate` require the container up.
- **Lint:** no lint script and no ESLint/Prettier config. N/A.
- **Type-check:** no standalone `tsc --noEmit` script, but `tsconfig.json` sets
  `"strict": true`. To type-check manually: `npx tsc --noEmit`.
- **CI / quality gate:** no `.github/workflows`, no CI. The gate is local `npm test`.

## Architecture in 5 lines

1. `parseMarkdown.ts` reads `content/pages/*.md` (gray-matter frontmatter) and merges
   `data/page-metadata.json`; `buildSearchProfile.ts` synthesises a deterministic
   `search_profile` string per page.
2. `elasticsearch.ts` defines the index `ai-search-decision-pages` + mappings;
   `indexDocs.ts` deletes/recreates it and bulk-indexes (refresh) the 6 docs.
3. `search.ts` builds one of three query shapes — `baseline_body_title` (multi_match
   title^3/body), `enriched_metadata` (boosted multi_match over metadata fields),
   `decision_router` (enriched + deterministic stage/topic boosts).
4. `decisionRouter.ts` maps a query to one of 6 `DecisionStage`s via ordered regex
   rules (pure function, no model, deterministic).
5. `evaluate.ts` runs all strategies over `data/judgments.json`, computes
   Precision@1 / MRR@3 / nDCG@3 (`metrics.ts`), and writes JSON + Markdown reports.

## Invariants I must never break

1. **Determinism of the router/pipeline.** `routeDecision`, `buildSearchProfile`, and
   `calculateMetrics` are pure and deterministic — no randomness, no clocks, no network
   in their logic, no LLM calls. Keep them deterministic so evaluation is reproducible
   (the only nondeterminism allowed is `generated_at` timestamp in the report).
2. **Passing the quality gate.** `npm test` (vitest) must stay green, and code must
   satisfy `tsconfig` `strict` mode (`npx tsc --noEmit` clean). There is no CI, so this
   is the gate — do not merge a change that breaks tests or strict typing.
3. **Provenance on every result.** Every indexed doc carries `id` and `source_file`, and
   every `SearchResult` returns `id`, `source_file`, `decision_stage`, and `score`. This
   is the project's "citation" analogue — do not drop source/id/score from search output
   or from the index mapping.
4. **No secrets in git.** No API keys/tokens/passwords are committed. `.env` is
   gitignored. The only config is `ELASTICSEARCH_URL` (defaults to
   `http://localhost:9200`); the dev Elasticsearch runs with security disabled, so do
   not introduce hardcoded credentials.

Repo-specific invariants:
- Always compare strategies — keep all three (`baseline_body_title`,
  `enriched_metadata`, `decision_router`) wired through `search.ts` and `evaluate.ts`;
  the point is the comparison, not a single "best" path.
- Keep the corpus self-contained: the 6 pages in `content/pages/`, their entries in
  `data/page-metadata.json`, and the queries in `data/judgments.json` must stay in
  sync (a judgment's rated ids must reference real page ids).
- No external LLM APIs and no frontend — this is a deliberate scope boundary stated in
  the README/SUMMARY.
- Pydantic/Zod parity: `judgments.json` and metadata are validated with Zod; keep
  loaders validating rather than trusting raw JSON.

## Definition of done

- `npm test` passes (vitest).
- `npx tsc --noEmit` is clean under `strict` (types pass).
- Quality gate: tests green (no CI exists, so local `npm test` is the gate).
- Provenance intact: search results and the index still carry `id` / `source_file` /
  `score`; reports still record per-query winners with the winning doc id.
- If the corpus, metadata, or judgments changed, `npm run index` + `npm run evaluate`
  still succeed and `reports/findability-report.{json,md}` regenerate without errors.
- README / SUMMARY updated if behaviour, commands, or strategies changed.
- No secrets added; `.env` stays gitignored; no hardcoded Elasticsearch credentials.
