export type DecisionStage =
  | "retrieval_strategy"
  | "semantic_implementation"
  | "hybrid_reranking"
  | "vector_tuning"
  | "retrieval_evaluation"
  | "semantic_migration";

export type PageMetadata = {
  id: string;
  source_file: string;
  decision_stage: DecisionStage;
  audience: string[];
  topics: string[];
  problems: string[];
};

export type ParsedMarkdownPage = {
  id: string;
  source_file: string;
  title: string;
  description: string;
  frontmatter: Record<string, unknown>;
  headings: string[];
  body: string;
};

export type SearchDocument = ParsedMarkdownPage &
  PageMetadata & {
    search_profile: string;
  };

export type SearchStrategy =
  | "baseline_body_title"
  | "enriched_metadata"
  | "decision_router";

export type SearchResult = {
  id: string;
  title: string;
  score: number;
  decision_stage: DecisionStage;
  source_file: string;
};

export type Judgment = {
  query: string;
  ratings: Record<string, number>;
};

export type MetricSet = {
  precisionAt1: number;
  mrrAt3: number;
  ndcgAt3: number;
};
