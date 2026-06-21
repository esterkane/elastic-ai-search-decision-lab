"""Hand-computed metric checks (binary and graded)."""

from __future__ import annotations

import math

import pytest

from relevance_eval.metrics import mrr_at_k, ndcg_at_k, precision_at_k, recall_at_k


def test_precision_at_k_binary():
    ranked = ["d1", "d2", "d3", "d4"]
    ratings = {"d2": 1, "d4": 1}
    assert precision_at_k(ranked, ratings, 1) == 0.0
    assert precision_at_k(ranked, ratings, 2) == 0.5
    assert precision_at_k(ranked, ratings, 4) == 0.5


def test_recall_at_k():
    ranked = ["d1", "d2", "d3", "d4"]
    ratings = {"d2": 1, "d4": 1}
    assert recall_at_k(ranked, ratings, 2) == 0.5
    assert recall_at_k(ranked, ratings, 4) == 1.0
    assert recall_at_k(ranked, {}, 4) == 0.0


def test_mrr_at_k():
    ranked = ["d1", "d2", "d3", "d4"]
    ratings = {"d2": 1, "d4": 1}
    assert mrr_at_k(ranked, ratings, 1) == 0.0
    assert mrr_at_k(ranked, ratings, 4) == 0.5
    assert mrr_at_k(["d2"], ratings, 1) == 1.0


def test_ndcg_at_k_binary():
    ranked = ["d1", "d2", "d3", "d4"]
    ratings = {"d2": 1, "d4": 1}
    dcg = 1 / math.log2(3) + 1 / math.log2(5)
    idcg = 1 / math.log2(2) + 1 / math.log2(3)
    assert ndcg_at_k(ranked, ratings, 4) == pytest.approx(dcg / idcg)
    assert ndcg_at_k(ranked, ratings, 4) == pytest.approx(0.6509, abs=1e-4)


def test_ndcg_at_k_graded_uses_exponential_gain():
    ranked = ["d2", "d1"]
    ratings = {"d1": 3, "d2": 1}
    dcg = (2**1 - 1) / math.log2(2) + (2**3 - 1) / math.log2(3)
    idcg = (2**3 - 1) / math.log2(2) + (2**1 - 1) / math.log2(3)
    assert ndcg_at_k(ranked, ratings, 2) == pytest.approx(dcg / idcg)
    assert ndcg_at_k(ranked, ratings, 2) == pytest.approx(0.7098, abs=1e-4)


def test_no_relevance_is_zero_not_error():
    assert precision_at_k(["a"], {}, 1) == 0.0
    assert mrr_at_k(["a"], {}, 1) == 0.0
    assert ndcg_at_k(["a"], {}, 1) == 0.0


def test_non_positive_k_raises():
    with pytest.raises(ValueError):
        precision_at_k(["a"], {"a": 1}, 0)
