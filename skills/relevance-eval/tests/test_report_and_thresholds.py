"""Report rendering + threshold gating."""

from __future__ import annotations

import json

import pytest

from relevance_eval.report import to_json, to_markdown
from relevance_eval.thresholds import evaluate_thresholds

REPORT = {
    "ks": [1, 3],
    "metrics": ["precision", "mrr", "ndcg"],
    "queries": 2,
    "strategies": {
        "enriched_metadata": {
            "queries": 2,
            "metrics": {
                "precision": {"1": 0.5, "3": 0.4},
                "mrr": {"1": 0.5, "3": 0.6},
                "ndcg": {"1": 0.5, "3": 0.55},
            },
        },
        "baseline": {
            "queries": 2,
            "metrics": {
                "precision": {"1": 0.0, "3": 0.2},
                "mrr": {"1": 0.0, "3": 0.3},
                "ndcg": {"1": 0.0, "3": 0.25},
            },
        },
    },
}


def test_to_json_is_stable_and_parseable():
    text = to_json(REPORT)
    assert json.loads(text) == REPORT
    assert to_json(REPORT) == text  # deterministic


def test_to_markdown_contains_strategies_and_metrics():
    md = to_markdown(REPORT)
    assert "## precision@k" in md
    assert "enriched_metadata" in md and "baseline" in md
    assert "0.5000" in md


def test_thresholds_pass_and_fail():
    thresholds = {
        "default": {"ndcg@3": 0.40},
        "enriched_metadata": {"precision@1": 0.4, "mrr@3": 0.5},
    }
    result = evaluate_thresholds(REPORT, thresholds)
    # enriched passes all; baseline fails the default ndcg@3 (0.25 < 0.40)
    assert result["passed"] is False
    failed = [c for c in result["checks"] if not c["passed"]]
    assert any(c["strategy"] == "baseline" and c["metric"] == "ndcg@3" for c in failed)
    assert any(
        c["strategy"] == "enriched_metadata" and c["metric"] == "precision@1" and c["passed"]
        for c in result["checks"]
    )


def test_thresholds_all_pass():
    result = evaluate_thresholds(REPORT, {"enriched_metadata": {"precision@1": 0.4}})
    assert result["passed"] is True


def test_missing_metric_is_flagged_and_fails():
    result = evaluate_thresholds(REPORT, {"enriched_metadata": {"precision@10": 0.1}})
    assert result["passed"] is False
    assert result["checks"][0]["missing"] is True


def test_invalid_threshold_key_raises():
    with pytest.raises(ValueError):
        evaluate_thresholds(REPORT, {"enriched_metadata": {"precision": 0.5}})


def test_markdown_with_threshold_section():
    thresholds = {"enriched_metadata": {"precision@1": 0.9}}
    result = evaluate_thresholds(REPORT, thresholds)
    md = to_markdown(REPORT, result)
    assert "## Thresholds" in md
    assert "FAIL" in md
