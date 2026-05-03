import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDEX_NAME, createElasticsearchClient } from "./elasticsearch.js";
import { routeDecision } from "./decisionRouter.js";
import type { DecisionStage, SearchResult, SearchStrategy } from "./types.js";

const strategies = new Set<SearchStrategy>(["baseline_body_title", "enriched_metadata", "decision_router"]);

export function buildSearchQuery(query: string, strategy: SearchStrategy) {
  if (strategy === "baseline_body_title") {
    return {
      multi_match: {
        query,
        fields: ["title^3", "body"]
      }
    };
  }

  const enriched = {
    multi_match: {
      query,
      fields: [
        "title^4",
        "description^3",
        "search_profile^3",
        "topics^2",
        "problems^2",
        "decision_stage^2",
        "body"
      ]
    }
  };

  if (strategy === "enriched_metadata") {
    return enriched;
  }

  const intent = routeDecision(query);
  return {
    bool: {
      must: [enriched],
      should: [
        { term: { decision_stage: { value: intent.decision_stage, boost: 5 } } },
        ...intent.topics.map((topic) => ({ term: { topics: { value: topic, boost: 2 } } }))
      ]
    }
  };
}

type ElasticHit = {
  _score?: number;
  _source?: {
    id: string;
    title: string;
    decision_stage: DecisionStage;
    source_file: string;
  };
};

export async function searchPages(
  query: string,
  strategy: SearchStrategy = "enriched_metadata",
  size = 3
): Promise<SearchResult[]> {
  const client = createElasticsearchClient();
  const response = await client.search({
    index: INDEX_NAME,
    size,
    query: buildSearchQuery(query, strategy),
    _source: ["id", "title", "decision_stage", "source_file"]
  });

  return (response.hits.hits as ElasticHit[]).flatMap((hit) =>
    hit._source
      ? [
          {
            id: hit._source.id,
            title: hit._source.title,
            decision_stage: hit._source.decision_stage,
            source_file: hit._source.source_file,
            score: hit._score ?? 0
          }
        ]
      : []
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const strategyArg = process.env.SEARCH_STRATEGY;
  const strategy = strategies.has(strategyArg as SearchStrategy)
    ? (strategyArg as SearchStrategy)
    : "enriched_metadata";
  const query = process.argv.slice(2).join(" ");

  if (!query) {
    throw new Error('Usage: npm run search -- "query text"');
  }

  const results = await searchPages(query, strategy, 5);
  console.table(results);
}
