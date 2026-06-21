"""Faithfulness / citation-accuracy scoring for generated answers.

Given an answer and the source texts it cited, score what fraction of the
answer's claims trace back to a provided source. Both the *claim extraction* and
the *support check* are behind interfaces, so the defaults here are deterministic
and offline now, and can be swapped for LLM/NLI-backed implementations later
without changing callers.

This path is intentionally decoupled from the relevance harness — it is for
LATER use once the consuming project generates answers (the search labs are
retrieval-only today).
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any, Protocol, runtime_checkable

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_TOKEN = re.compile(r"[a-z0-9]+")


@runtime_checkable
class ClaimExtractor(Protocol):
    """Splits a generated answer into atomic claims to be checked."""

    def extract_claims(self, answer: str) -> list[str]: ...


@runtime_checkable
class SupportScorer(Protocol):
    """Scores how strongly a single source supports a single claim, in [0, 1]."""

    def score(self, claim: str, source: str) -> float: ...


def _tokens(text: str) -> set[str]:
    return set(_TOKEN.findall(text.lower()))


class DeterministicClaimExtractor:
    """Sentence-level claim extraction by punctuation. Deterministic & offline.

    Swap for an LLM-backed extractor later by implementing :class:`ClaimExtractor`.
    """

    def __init__(self, min_tokens: int = 3) -> None:
        self.min_tokens = min_tokens

    def extract_claims(self, answer: str) -> list[str]:
        claims: list[str] = []
        for sentence in _SENTENCE_SPLIT.split(answer.strip()):
            sentence = sentence.strip()
            if len(_TOKEN.findall(sentence.lower())) >= self.min_tokens:
                claims.append(sentence)
        return claims


class TokenOverlapScorer:
    """Support = fraction of the claim's tokens present in the source
    (containment). Deterministic & offline. Swap for an NLI/LLM scorer later by
    implementing :class:`SupportScorer`."""

    def score(self, claim: str, source: str) -> float:
        claim_tokens = _tokens(claim)
        if not claim_tokens:
            return 0.0
        return len(claim_tokens & _tokens(source)) / len(claim_tokens)


def faithfulness_score(
    answer: str,
    sources: Sequence[str],
    *,
    extractor: ClaimExtractor | None = None,
    scorer: SupportScorer | None = None,
    support_threshold: float = 0.6,
) -> dict[str, Any]:
    """Score the fraction of an answer's claims that trace to a cited source.

    Returns ``{score, supported, total, support_threshold, claims: [{claim,
    supported, best_source_index, support_score}]}``. With no extractable claims
    the score is 1.0 (nothing unsupported) and ``total`` is 0 so callers can
    decide how to treat empty answers.
    """
    extractor = extractor or DeterministicClaimExtractor()
    scorer = scorer or TokenOverlapScorer()
    source_list = list(sources)

    claims = extractor.extract_claims(answer)
    results: list[dict[str, Any]] = []
    supported = 0
    for claim in claims:
        best_index = -1
        best_score = 0.0
        for index, source in enumerate(source_list):
            value = scorer.score(claim, source)
            if value > best_score:
                best_score = value
                best_index = index
        is_supported = best_score >= support_threshold
        supported += int(is_supported)
        results.append(
            {
                "claim": claim,
                "supported": is_supported,
                "best_source_index": best_index if best_index >= 0 else None,
                "support_score": best_score,
            }
        )

    total = len(claims)
    score = 1.0 if total == 0 else supported / total
    return {
        "score": score,
        "supported": supported,
        "total": total,
        "support_threshold": support_threshold,
        "claims": results,
    }
