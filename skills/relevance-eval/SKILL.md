---
name: relevance-eval
description: Reusable, offline, dependency-light evaluation for search relevance (Precision@k, MRR@k, nDCG@k per strategy, with JSON + Markdown reports and pass/fail gating against a thresholds file) and answer faithfulness/citation-accuracy. The search function is injected, so there is zero Elasticsearch/backend coupling. Use when measuring or regression-gating retrieval quality across strategies in any project (kcs, product-search-lab, repo-inventory, …), or scoring whether a generated answer's claims trace to its cited sources.
---

# relevance-eval

A self-contained Python skill that turns a set of relevance judgments plus an
**injected** search function into per-strategy ranking metrics, a JSON + Markdown
report, and a pass/fail verdict against a thresholds file. It also ships a
separate **faithfulness** path for scoring generated answers against their cited
sources.

Pure standard library. Deterministic. Offline. No Elasticsearch — the caller
adapts their own search to `(query, strategy) -> ranked doc ids`, which is what
lets different projects reuse it **without modifying the skill**.

## When to use it

- You have judged queries and want to compare retrieval strategies (e.g.
  `baseline_bm25` vs `enriched_profile`) on Precision@k / MRR@k / nDCG@k.
- You want a CI/regression gate: "nDCG@3 for the enriched strategy must stay ≥ 0.5".
- You generate answers and want to measure what fraction of their claims trace to
  cited sources (citation accuracy / faithfulness).

Do **not** reach for it to *run* searches — it never calls a backend; it scores
the rankings you give it.

## Inputs and outputs

### Relevance: `run_evaluation(judgments, search_fn, strategies, *, ks=(1,3,5,10), metrics=("precision","mrr","ndcg"), include_per_query=False)`

| Input | Shape | Notes |
|---|---|---|
| `judgments` | `{query: [relevant_id, ...]}` or `{query: {id: grade}}` | Binary list **or** graded mapping. Grades use exponential-gain nDCG (`2**grade − 1`). |
| `search_fn` | `(query, strategy) -> [doc_id, ...]` | **Injected.** Ranked best-first. Your adapter extracts ids from your own hit objects. |
| `strategies` | `["s1", "s2", ...]` | Passed through to `search_fn` as the second arg. |
| `ks` | `(1, 3, 5, 10)` | Cutoffs to score at. |

Returns a JSON-serialisable report:

```jsonc
{
  "ks": [1, 5], "metrics": ["precision","mrr","ndcg"], "queries": 2,
  "strategies": {
    "enriched_profile": { "queries": 2, "metrics": {
      "precision": {"1": 0.5, "5": 0.4}, "mrr": {"1": 0.5, "5": 0.6}, "ndcg": {"1": 0.5, "5": 0.55} } }
  }
}
```

- `to_json(report)` → stable, sorted JSON string.
- `to_markdown(report, threshold_result=None)` → one table per metric (+ a thresholds section).
- `evaluate_thresholds(report, thresholds)` → `{"passed": bool, "checks": [...]}`.

### Thresholds file

Keys are `"<metric>@<k>"`. `default` applies to every strategy; a per-strategy
block overrides it.

```json
{
  "default": { "ndcg@3": 0.40 },
  "enriched_metadata": { "precision@1": 0.50, "mrr@3": 0.55, "ndcg@3": 0.50 }
}
```

### Faithfulness: `faithfulness_score(answer, sources, *, extractor=None, scorer=None, support_threshold=0.6)`

Given a generated `answer` and the `sources` (chunk texts) it cited, returns the
fraction of the answer's claims that trace to a source:

```jsonc
{ "score": 0.5, "supported": 1, "total": 2, "support_threshold": 0.6,
  "claims": [ {"claim": "...", "supported": true, "best_source_index": 0, "support_score": 1.0}, ... ] }
```

Both stages are behind interfaces so the deterministic defaults can be swapped
for LLM-backed ones later, **without changing callers**:

- `ClaimExtractor.extract_claims(answer) -> [str]` — default `DeterministicClaimExtractor` (sentence split).
- `SupportScorer.score(claim, source) -> float` — default `TokenOverlapScorer` (token containment).

This path is for **later** use once a project generates answers (the search labs
are retrieval-only today); it is independent of `run_evaluation`.

## Examples

### Relevance + gate

```python
from relevance_eval import run_evaluation, to_markdown, to_json, evaluate_thresholds, load_thresholds

judgments = {"vector search": ["d12", "d4"], "rerank latency": {"d9": 2, "d3": 1}}
report = run_evaluation(judgments, my_search, ["baseline", "enriched"], ks=(1, 3, 5))

open("report.json", "w").write(to_json(report))
gate = evaluate_thresholds(report, load_thresholds("thresholds.json"))
open("report.md", "w").write(to_markdown(report, gate))
raise SystemExit(0 if gate["passed"] else 1)   # CI-friendly
```

### Faithfulness (deterministic now, LLM-backed later)

```python
from relevance_eval import faithfulness_score

result = faithfulness_score(answer_text, [chunk["content"] for chunk in cited_chunks])
print(result["score"])              # fraction of claims supported

# later: plug in an LLM extractor/scorer without touching callers
result = faithfulness_score(answer_text, sources, extractor=LlmClaimExtractor(), scorer=NliScorer())
```

### The 10-line product-search-lab import (`examples/product_search_lab.py`)

```python
from relevance_eval import evaluate_thresholds, run_evaluation, to_markdown
from src.search.strategies import search_products            # product-search-lab's shared search

def search(query, strategy):                                 # inject: adapt to ranked ids
    return [hit["id"] for hit in search_products(query, strategy=strategy, size=10)]

judgments = {"running shoes": ["p-101", "p-205"], "rain jacket": {"p-77": 2, "p-88": 1}}
strategies = ["baseline_bm25", "boosted_bm25", "enriched_profile"]
report = run_evaluation(judgments, search, strategies, ks=(1, 5))
print(to_markdown(report, evaluate_thresholds(report, {"enriched_profile": {"ndcg@5": 0.5}})))
```

### Adapting the other consumers (same skill, only the adapter changes)

```python
# kcs-control-plane — strategy = which similarity signal; ids = cluster/article ids
def search(query, strategy):
    return [hit.article_id for hit in find_similar(query, signal=strategy)]

# repo-inventory — wrap the MCP/HTTP hybrid_search; ids = chunk ids
def search(query, strategy):
    return [hit["id"] for hit in hybrid_search(query, filters={"strategy": strategy})["hits"]]
```

## Install, run, test

```bash
# use it from another project
pip install -e path/to/skills/relevance-eval     # exposes the `relevance_eval` package

# develop / test the skill itself
cd skills/relevance-eval
pip install -e ".[dev]"
pytest -q
```

## Design guarantees

- **Deterministic & offline** — stdlib only; queries processed in sorted order;
  mean aggregation; stable (sorted-key) JSON. Same inputs → byte-identical output.
- **No backend coupling** — the search function is injected; the skill never
  imports or calls Elasticsearch/Qdrant/an LLM.
- **Faithful to the original** — generalises this repo's `metrics.ts`
  (Precision@1 / MRR@3 / nDCG@3, exponential-gain nDCG) to arbitrary `k`.
- **Pluggable faithfulness** — claim extraction and support scoring are
  interfaces; deterministic defaults today, LLM/NLI implementations later.
