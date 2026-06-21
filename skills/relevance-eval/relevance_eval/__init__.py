"""relevance-eval — a reusable, offline, dependency-light evaluation skill.

Relevance: Precision@k / MRR@k / nDCG@k per strategy, with a JSON + Markdown
report and pass/fail gating against a thresholds file. The search function is
injected, so there is no backend coupling.

Faithfulness: citation-accuracy scoring for generated answers, with pluggable
claim-extraction and support-scoring interfaces (deterministic now, LLM-backed
later).
"""

from __future__ import annotations

from .faithfulness import (
    ClaimExtractor,
    DeterministicClaimExtractor,
    SupportScorer,
    TokenOverlapScorer,
    faithfulness_score,
)
from .harness import SearchFn, normalize_ratings, run_evaluation
from .metrics import mrr_at_k, ndcg_at_k, precision_at_k, recall_at_k
from .report import to_json, to_markdown
from .thresholds import evaluate_thresholds, load_thresholds

__all__ = [
    # relevance
    "run_evaluation",
    "normalize_ratings",
    "SearchFn",
    "precision_at_k",
    "recall_at_k",
    "mrr_at_k",
    "ndcg_at_k",
    # reporting + gating
    "to_json",
    "to_markdown",
    "evaluate_thresholds",
    "load_thresholds",
    # faithfulness
    "faithfulness_score",
    "ClaimExtractor",
    "SupportScorer",
    "DeterministicClaimExtractor",
    "TokenOverlapScorer",
]

__version__ = "0.1.0"
