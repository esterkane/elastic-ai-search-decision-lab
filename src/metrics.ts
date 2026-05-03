import type { MetricSet } from "./types.js";

export function precisionAt1(resultIds: string[], ratings: Record<string, number>): number {
  return (ratings[resultIds[0]] ?? 0) > 0 ? 1 : 0;
}

export function mrrAt3(resultIds: string[], ratings: Record<string, number>): number {
  const rank = resultIds.slice(0, 3).findIndex((id) => (ratings[id] ?? 0) > 0);
  return rank === -1 ? 0 : 1 / (rank + 1);
}

function dcg(resultIds: string[], ratings: Record<string, number>, k: number): number {
  return resultIds.slice(0, k).reduce((sum, id, index) => {
    const gain = 2 ** (ratings[id] ?? 0) - 1;
    return sum + gain / Math.log2(index + 2);
  }, 0);
}

export function ndcgAt3(resultIds: string[], ratings: Record<string, number>): number {
  const idealIds = Object.entries(ratings)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);
  const ideal = dcg(idealIds, ratings, 3);
  return ideal === 0 ? 0 : dcg(resultIds, ratings, 3) / ideal;
}

export function calculateMetrics(resultIds: string[], ratings: Record<string, number>): MetricSet {
  return {
    precisionAt1: precisionAt1(resultIds, ratings),
    mrrAt3: mrrAt3(resultIds, ratings),
    ndcgAt3: ndcgAt3(resultIds, ratings)
  };
}

export function averageMetrics(metricSets: MetricSet[]): MetricSet {
  const empty = { precisionAt1: 0, mrrAt3: 0, ndcgAt3: 0 };
  if (!metricSets.length) return empty;
  return metricSets.reduce(
    (sum, metric) => ({
      precisionAt1: sum.precisionAt1 + metric.precisionAt1 / metricSets.length,
      mrrAt3: sum.mrrAt3 + metric.mrrAt3 / metricSets.length,
      ndcgAt3: sum.ndcgAt3 + metric.ndcgAt3 / metricSets.length
    }),
    empty
  );
}
