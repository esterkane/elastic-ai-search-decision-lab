"""Render an evaluation report as JSON or Markdown (deterministic, offline)."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any


def to_json(report: Mapping[str, Any], *, indent: int = 2) -> str:
    """Stable JSON (sorted keys) so reports diff cleanly in version control."""
    return json.dumps(report, indent=indent, sort_keys=True)


def _fmt(value: Any) -> str:
    return "n/a" if value is None else f"{value:.4f}"


def to_markdown(
    report: Mapping[str, Any],
    threshold_result: Mapping[str, Any] | None = None,
    *,
    title: str = "Relevance evaluation",
) -> str:
    """One table per metric (rows = strategies, columns = k), plus an optional
    thresholds pass/fail section when a threshold_result is supplied."""
    ks = report["ks"]
    metrics = report["metrics"]
    strategies = report["strategies"]

    lines = [
        f"# {title}",
        "",
        f"_{report['queries']} queries · k = {', '.join(str(k) for k in ks)}_",
        "",
    ]

    for metric in metrics:
        lines.append(f"## {metric}@k")
        lines.append("| strategy | " + " | ".join(f"@{k}" for k in ks) + " |")
        lines.append("|" + "---|" * (len(ks) + 1))
        for strategy, data in strategies.items():
            row = [strategy] + [_fmt(data["metrics"][metric][str(k)]) for k in ks]
            lines.append("| " + " | ".join(row) + " |")
        lines.append("")

    if threshold_result is not None:
        overall = "PASS ✅" if threshold_result["passed"] else "FAIL ❌"
        lines.append("## Thresholds")
        lines.append("")
        lines.append(f"**Overall: {overall}**")
        lines.append("")
        lines.append("| strategy | metric | threshold | value | result |")
        lines.append("|---|---|---|---|---|")
        for check in threshold_result["checks"]:
            mark = "✅" if check["passed"] else "❌"
            lines.append(
                f"| {check['strategy']} | {check['metric']} | "
                f"{check['threshold']:.4f} | {_fmt(check['value'])} | {mark} |"
            )
        lines.append("")

    return "\n".join(lines)
