import type { PageMetadata } from "./types.js";

type ProfileInput = {
  title?: string;
  description?: string;
} & Partial<Pick<PageMetadata, "decision_stage" | "audience" | "topics" | "problems">>;

const stageLabels: Record<string, string> = {
  retrieval_strategy: "choosing a retrieval strategy",
  semantic_implementation: "choosing a semantic search implementation",
  hybrid_reranking: "choosing hybrid search and reranking",
  vector_tuning: "tuning vector search relevance and performance",
  retrieval_evaluation: "evaluating retrieval quality",
  semantic_migration: "adding semantic search to an existing index"
};

export function buildSearchProfile(input: ProfileInput): string {
  const title = input.title?.trim() || "Untitled decision page";
  const stage = input.decision_stage
    ? stageLabels[input.decision_stage] ?? input.decision_stage.replaceAll("_", " ")
    : "making an AI search decision";
  const audience = input.audience?.length ? input.audience.join(", ") : "practitioners";
  const topics = input.topics?.length ? input.topics.join(", ") : "AI search";
  const problem = input.problems?.[0] ?? input.description ?? "the user needs practical implementation guidance";

  return `Decision guide for ${audience} ${stage}. ${title}. Topics: ${topics}. Useful when ${problem}.`;
}
