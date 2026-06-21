"""The evaluation harness: run a set of judgments through one or more strategies.

The search function is INJECTED, so this module has no Elasticsearch (or any
backend) coupling — the caller adapts their own search to ``(query, strategy) ->
ranked doc ids``. This is what lets kcs, product-search-lab, and repo-inventory
reuse the skill unchanged.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from .metrics import mrr_at_k, ndcg_at_k, precision_at_k, recall_at_k

# (query, strategy) -> ranked list of doc ids, best first.
SearchFn = Callable[[str, str], Sequence[str]]

# A judgment value is either a list of relevant ids (binary) or a graded mapping.
JudgmentValue = "Sequence[str] | Mapping[str, float]"

_METRIC_FNS = {
    "precision": precision_at_k,
    "recall": recall_at_k,
    "mrr": mrr_at_k,
    "ndcg": ndcg_at_k,
}
DEFAULT_METRICS = ("precision", "mrr", "ndcg")


def normalize_ratings(value: Any) -> dict[str, float]:
    """Accept either ``["id1", "id2"]`` (binary) or ``{"id1": 2.0}`` (graded)."""
    if isinstance(value, Mapping):
        return {str(doc_id): float(rating) for doc_id, rating in value.items()}
    return {str(doc_id): 1.0 for doc_id in value}


def run_evaluation(
    judgments: Mapping[str, Any],
    search_fn: SearchFn,
    strategies: Sequence[str],
    *,
    ks: Sequence[int] = (1, 3, 5, 10),
    metrics: Sequence[str] = DEFAULT_METRICS,
    include_per_query: bool = False,
) -> dict[str, Any]:
    """Evaluate every strategy over every judged query and aggregate by mean.

    Returns a JSON-serialisable report:
        {ks, metrics, queries, strategies: {<strategy>: {queries,
         metrics: {<metric>: {"<k>": mean_value}}, [per_query]}}}
    Deterministic: queries are processed in sorted order and aggregation is a
    plain mean, so the same inputs always produce byte-identical output.
    """
    unknown = [m for m in metrics if m not in _METRIC_FNS]
    if unknown:
        raise ValueError(f"Unknown metric(s): {unknown}. Known: {sorted(_METRIC_FNS)}")

    queries = sorted(judgments)
    ratings_by_query = {query: normalize_ratings(judgments[query]) for query in queries}

    report: dict[str, Any] = {
        "ks": list(ks),
        "metrics": list(metrics),
        "queries": len(queries),
        "strategies": {},
    }

    for strategy in strategies:
        totals = {metric: {k: 0.0 for k in ks} for metric in metrics}
        per_query: dict[str, Any] = {}
        for query in queries:
            ranked = list(search_fn(query, strategy))
            ratings = ratings_by_query[query]
            query_scores: dict[str, dict[str, float]] = {metric: {} for metric in metrics}
            for metric in metrics:
                fn = _METRIC_FNS[metric]
                for k in ks:
                    value = fn(ranked, ratings, k)
                    query_scores[metric][str(k)] = value
                    totals[metric][k] += value
            if include_per_query:
                per_query[query] = query_scores

        denom = len(queries) or 1
        strategy_block: dict[str, Any] = {
            "queries": len(queries),
            "metrics": {
                metric: {str(k): totals[metric][k] / denom for k in ks} for metric in metrics
            },
        }
        if include_per_query:
            strategy_block["per_query"] = per_query
        report["strategies"][strategy] = strategy_block

    return report
