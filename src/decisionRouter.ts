import type { DecisionStage } from "./types.js";

export type DecisionIntent = {
  decision_stage: DecisionStage;
  topics: string[];
};

const routes: Array<{ stage: DecisionStage; topics: string[]; patterns: RegExp[] }> = [
  {
    stage: "semantic_migration",
    topics: ["semantic reranking", "reindex", "alias swap", "BM25 migration"],
    patterns: [/existing (bm25 )?index/u, /without (reindex|downtime)/u, /alias swap/u, /add semantic/u]
  },
  {
    stage: "retrieval_evaluation",
    topics: ["judgment sets", "NDCG", "MRR", "rank evaluation API"],
    patterns: [/measure|metric|evaluate|judg(e)?ment|ndcg|mrr|precision|rank eval/u]
  },
  {
    stage: "vector_tuning",
    topics: ["HNSW", "quantization", "num_candidates", "rescore_vector"],
    patterns: [/vector.*(slow|memory|latency|recall|tune)/u, /num_candidates|hnsw|quantization|knn|rescor/u]
  },
  {
    stage: "hybrid_reranking",
    topics: ["RRF", "linear retriever", "semantic reranking", "Learning to Rank"],
    patterns: [/rrf|linear (combination|retriever|weight)/u, /rerank|wrong order|hybrid|learning to rank|ltr/u]
  },
  {
    stage: "semantic_implementation",
    topics: ["semantic_text", "inference API", "ELSER", "dense_vector"],
    patterns: [/semantic_text|inference api|elser|dense_vector|embedding implementation/u]
  },
  {
    stage: "retrieval_strategy",
    topics: ["BM25", "semantic search", "hybrid search", "reranking"],
    patterns: [/bm25|keyword|retrieval strategy|where should i start|full text|full-text/u]
  }
];

export function routeDecision(query: string): DecisionIntent {
  const normalized = query.toLowerCase();
  const match = routes.find((route) => route.patterns.some((pattern) => pattern.test(normalized)));
  return match
    ? { decision_stage: match.stage, topics: match.topics }
    : { decision_stage: "retrieval_strategy", topics: ["BM25", "semantic search", "hybrid search", "reranking"] };
}
