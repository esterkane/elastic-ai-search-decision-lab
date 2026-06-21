"""Pure relevance metrics (offline, stdlib-only).

Ratings are graded: a mapping ``doc_id -> relevance``, where ``relevance == 0``
means "not relevant" and any positive number is relevant (higher = better). This
generalises the project's original ``metrics.ts`` (Precision@1 / MRR@3 / nDCG@3)
to an arbitrary cutoff ``k``, keeping its exponential-gain nDCG (``2**rel - 1``).
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

Ratings = Mapping[str, float]


def precision_at_k(ranked: Sequence[str], ratings: Ratings, k: int) -> float:
    """Fraction of the top-k results that are relevant (denominator is k)."""
    if k <= 0:
        raise ValueError("k must be a positive integer")
    hits = sum(1 for doc_id in ranked[:k] if ratings.get(doc_id, 0) > 0)
    return hits / k


def recall_at_k(ranked: Sequence[str], ratings: Ratings, k: int) -> float:
    """Fraction of all relevant documents found in the top-k."""
    if k <= 0:
        raise ValueError("k must be a positive integer")
    relevant_total = sum(1 for rating in ratings.values() if rating > 0)
    if relevant_total == 0:
        return 0.0
    hits = sum(1 for doc_id in ranked[:k] if ratings.get(doc_id, 0) > 0)
    return hits / relevant_total


def mrr_at_k(ranked: Sequence[str], ratings: Ratings, k: int) -> float:
    """Reciprocal rank of the first relevant result within the top-k (else 0)."""
    if k <= 0:
        raise ValueError("k must be a positive integer")
    for index, doc_id in enumerate(ranked[:k]):
        if ratings.get(doc_id, 0) > 0:
            return 1.0 / (index + 1)
    return 0.0


def _dcg(ranked: Sequence[str], ratings: Ratings, k: int) -> float:
    total = 0.0
    for index, doc_id in enumerate(ranked[:k]):
        gain = (2 ** ratings.get(doc_id, 0)) - 1
        total += gain / math.log2(index + 2)
    return total


def ndcg_at_k(ranked: Sequence[str], ratings: Ratings, k: int) -> float:
    """Normalised DCG@k with exponential gain (2**rel - 1). 0 when no relevance."""
    if k <= 0:
        raise ValueError("k must be a positive integer")
    # Deterministic ideal ordering: by descending rating, then doc_id for ties.
    ideal_ids = [doc_id for doc_id, _ in sorted(ratings.items(), key=lambda kv: (-kv[1], kv[0]))]
    ideal = _dcg(ideal_ids, ratings, k)
    if ideal == 0:
        return 0.0
    return _dcg(ranked, ratings, k) / ideal
