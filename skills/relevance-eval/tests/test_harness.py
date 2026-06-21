"""Harness aggregation, determinism, and injected-search-function behaviour."""

from __future__ import annotations

import pytest

from relevance_eval.harness import run_evaluation

# A fake, injected search function: canned rankings per (query, strategy).
RANKINGS = {
    ("q1", "good"): ["d1", "d2", "d3"],
    ("q1", "bad"): ["d3", "d9", "d1"],
    ("q2", "good"): ["e1", "e2"],
    ("q2", "bad"): ["e9", "e8"],
}
JUDGMENTS = {"q1": ["d1"], "q2": ["e1", "e2"]}


def fake_search(query, strategy):
    return RANKINGS[(query, strategy)]


def test_aggregates_by_mean_across_queries():
    report = run_evaluation(JUDGMENTS, fake_search, ["good"], ks=(1,))
    # q1 P@1 = 1 (d1 relevant), q2 P@1 = 1 (e1 relevant) -> mean 1.0
    assert report["strategies"]["good"]["metrics"]["precision"]["1"] == 1.0
    # "bad": q1 P@1 = 0 (d3), q2 P@1 = 0 (e9) -> 0.0
    report_bad = run_evaluation(JUDGMENTS, fake_search, ["bad"], ks=(1,))
    assert report_bad["strategies"]["bad"]["metrics"]["precision"]["1"] == 0.0


def test_structure_and_multiple_strategies():
    report = run_evaluation(JUDGMENTS, fake_search, ["good", "bad"], ks=(1, 2))
    assert report["queries"] == 2
    assert set(report["strategies"]) == {"good", "bad"}
    assert report["ks"] == [1, 2]
    assert set(report["strategies"]["good"]["metrics"]) == {"precision", "mrr", "ndcg"}


def test_deterministic():
    a = run_evaluation(JUDGMENTS, fake_search, ["good", "bad"], ks=(1, 2, 3))
    b = run_evaluation(JUDGMENTS, fake_search, ["good", "bad"], ks=(1, 2, 3))
    assert a == b


def test_binary_and_graded_judgments_both_accepted():
    graded = {"q1": {"d1": 3.0}, "q2": {"e1": 2.0, "e2": 1.0}}
    report = run_evaluation(graded, fake_search, ["good"], ks=(1,))
    assert report["strategies"]["good"]["metrics"]["precision"]["1"] == 1.0


def test_per_query_optional():
    report = run_evaluation(JUDGMENTS, fake_search, ["good"], ks=(1,), include_per_query=True)
    assert "per_query" in report["strategies"]["good"]
    assert set(report["strategies"]["good"]["per_query"]) == {"q1", "q2"}


def test_unknown_metric_raises():
    with pytest.raises(ValueError):
        run_evaluation(JUDGMENTS, fake_search, ["good"], metrics=("bogus",))
