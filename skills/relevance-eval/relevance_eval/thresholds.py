"""Pass/fail gating of an evaluation report against a thresholds file.

Thresholds file format (JSON)::

    {
        "default": { "ndcg@3": 0.40 },           # applied to every strategy
        "enriched_metadata": { "precision@1": 0.6, "mrr@3": 0.6 }
    }

Keys are "<metric>@<k>" (e.g. "precision@1", "mrr@3", "ndcg@5"). A strategy's
effective rules are ``default`` merged with its own block (its own wins).
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any


def load_thresholds(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def _parse_metric_key(key: str) -> tuple[str, str]:
    metric, sep, k = key.partition("@")
    if not sep or not k.isdigit():
        raise ValueError(
            f"Invalid threshold key {key!r}. Use '<metric>@<k>', e.g. 'precision@1'."
        )
    return metric.strip(), str(int(k))


def evaluate_thresholds(
    report: Mapping[str, Any], thresholds: Mapping[str, Any]
) -> dict[str, Any]:
    """Check each report strategy against its thresholds. Returns
    ``{"passed": bool, "checks": [{strategy, metric, threshold, value, passed,
    [missing]}]}``. A threshold for a metric/k not present in the report fails
    the check and is flagged ``missing``. Empty thresholds => passed=True."""
    default_rules = dict(thresholds.get("default", {}))
    checks: list[dict[str, Any]] = []

    for strategy, data in report["strategies"].items():
        rules = {**default_rules, **dict(thresholds.get(strategy, {}))}
        for key, threshold in sorted(rules.items()):
            metric, k = _parse_metric_key(key)
            metric_block = data["metrics"].get(metric)
            if metric_block is None or k not in metric_block:
                checks.append(
                    {
                        "strategy": strategy,
                        "metric": key,
                        "threshold": float(threshold),
                        "value": None,
                        "passed": False,
                        "missing": True,
                    }
                )
                continue
            value = metric_block[k]
            checks.append(
                {
                    "strategy": strategy,
                    "metric": key,
                    "threshold": float(threshold),
                    "value": value,
                    "passed": value >= threshold,
                }
            )

    passed = all(check["passed"] for check in checks) if checks else True
    return {"passed": passed, "checks": checks}
