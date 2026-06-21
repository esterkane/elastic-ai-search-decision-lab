"""Faithfulness scoring + pluggable extractor/scorer interfaces."""

from __future__ import annotations

from relevance_eval.faithfulness import (
    DeterministicClaimExtractor,
    TokenOverlapScorer,
    faithfulness_score,
)


def test_supported_vs_unsupported_claims():
    answer = "Hybrid search fuses lexical and dense retrieval. The capital of France is Rome."
    sources = ["Hybrid search fuses lexical and dense retrieval signals with RRF."]
    result = faithfulness_score(answer, sources, support_threshold=0.6)
    assert result["total"] == 2
    assert result["supported"] == 1
    assert result["score"] == 0.5
    assert result["claims"][0]["supported"] is True
    assert result["claims"][0]["best_source_index"] == 0
    assert result["claims"][1]["supported"] is False


def test_empty_answer_is_vacuously_faithful():
    result = faithfulness_score("", ["anything"])
    assert result["total"] == 0
    assert result["score"] == 1.0


def test_deterministic():
    answer = "Reranking improves ordering. It also adds latency."
    sources = ["Reranking improves ordering but adds latency."]
    assert faithfulness_score(answer, sources) == faithfulness_score(answer, sources)


def test_custom_claim_extractor_is_used():
    class FixedExtractor:
        def extract_claims(self, answer):
            return ["alpha beta", "gamma delta"]

    result = faithfulness_score("ignored text", ["alpha beta gamma"], extractor=FixedExtractor())
    assert [c["claim"] for c in result["claims"]] == ["alpha beta", "gamma delta"]
    assert result["claims"][0]["supported"] is True  # "alpha beta" both in source
    assert result["claims"][1]["supported"] is False  # "delta" missing


def test_custom_support_scorer_is_used():
    class AlwaysOne:
        def score(self, claim, source):
            return 1.0

    result = faithfulness_score(
        "Some claim here.", ["unrelated"], scorer=AlwaysOne(), support_threshold=0.6
    )
    assert result["score"] == 1.0


def test_default_components_are_swappable_types():
    # The defaults satisfy the documented interfaces.
    assert hasattr(DeterministicClaimExtractor(), "extract_claims")
    assert hasattr(TokenOverlapScorer(), "score")
