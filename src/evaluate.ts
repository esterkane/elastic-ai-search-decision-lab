import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { searchPages } from "./search.js";
import { averageMetrics, calculateMetrics } from "./metrics.js";
import { projectRoot } from "./parseMarkdown.js";
import type { Judgment, MetricSet, SearchStrategy } from "./types.js";

const judgmentSchema = z.array(
  z.object({
    query: z.string(),
    ratings: z.record(z.number())
  })
);

const strategies: SearchStrategy[] = ["baseline_body_title", "enriched_metadata", "decision_router"];

export async function loadJudgments(): Promise<Judgment[]> {
  const raw = await fs.readFile(path.join(projectRoot, "data", "judgments.json"), "utf8");
  return judgmentSchema.parse(JSON.parse(raw));
}

function roundMetric(metric: number): number {
  return Number(metric.toFixed(4));
}

function roundMetrics(metrics: MetricSet): MetricSet {
  return {
    precisionAt1: roundMetric(metrics.precisionAt1),
    mrrAt3: roundMetric(metrics.mrrAt3),
    ndcgAt3: roundMetric(metrics.ndcgAt3)
  };
}

export async function evaluate() {
  const judgments = await loadJudgments();
  const perQuery = [];
  const aggregate: Record<SearchStrategy, MetricSet[]> = {
    baseline_body_title: [],
    enriched_metadata: [],
    decision_router: []
  };

  for (const judgment of judgments) {
    const runs = [];
    for (const strategy of strategies) {
      const results = await searchPages(judgment.query, strategy, 3);
      const resultIds = results.map((result) => result.id);
      const metrics = calculateMetrics(resultIds, judgment.ratings);
      aggregate[strategy].push(metrics);
      runs.push({ strategy, metrics: roundMetrics(metrics), results });
    }

    const winner = [...runs].sort((a, b) => {
      const ndcgDelta = b.metrics.ndcgAt3 - a.metrics.ndcgAt3;
      if (ndcgDelta !== 0) return ndcgDelta;
      const mrrDelta = b.metrics.mrrAt3 - a.metrics.mrrAt3;
      if (mrrDelta !== 0) return mrrDelta;
      return b.metrics.precisionAt1 - a.metrics.precisionAt1;
    })[0].strategy;

    perQuery.push({ query: judgment.query, winner, runs });
  }

  const summary = Object.fromEntries(
    strategies.map((strategy) => [strategy, roundMetrics(averageMetrics(aggregate[strategy]))])
  );

  return {
    generated_at: new Date().toISOString(),
    metrics: { precisionAt1: "Precision@1", mrrAt3: "MRR@3", ndcgAt3: "nDCG@3" },
    summary,
    per_query: perQuery
  };
}

function toMarkdown(report: Awaited<ReturnType<typeof evaluate>>): string {
  const summaryRows = strategies
    .map((strategy) => {
      const metric = report.summary[strategy];
      return `| ${strategy} | ${metric.precisionAt1} | ${metric.mrrAt3} | ${metric.ndcgAt3} |`;
    })
    .join("\n");

  const queryRows = report.per_query
    .map((entry) => {
      const top = entry.runs.find((run) => run.strategy === entry.winner)?.results[0];
      return `| ${entry.query} | ${entry.winner} | ${top?.id ?? "none"} |`;
    })
    .join("\n");

  return `# Findability report

Generated at: ${report.generated_at}

## Strategy summary

| Strategy | Precision@1 | MRR@3 | nDCG@3 |
| --- | ---: | ---: | ---: |
${summaryRows}

## Per-query winners

| Query | Winner | Winner top result |
| --- | --- | --- |
${queryRows}
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await evaluate();
  const reportsDir = path.join(projectRoot, "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.writeFile(path.join(reportsDir, "findability-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(reportsDir, "findability-report.md"), toMarkdown(report));
  console.log("Wrote reports/findability-report.json and reports/findability-report.md");
}
