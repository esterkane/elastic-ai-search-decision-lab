import { Client } from "@elastic/elasticsearch";

export const INDEX_NAME = "ai-search-decision-pages";

export function createElasticsearchClient(): Client {
  return new Client({
    node: process.env.ELASTICSEARCH_URL ?? "http://localhost:9200"
  });
}

export async function setupIndex(client = createElasticsearchClient()): Promise<void> {
  const exists = await client.indices.exists({ index: INDEX_NAME });
  if (exists) {
    await client.indices.delete({ index: INDEX_NAME });
  }

  await client.indices.create({
    index: INDEX_NAME,
    mappings: {
      properties: {
        id: { type: "keyword" },
        source_file: { type: "keyword" },
        title: {
          type: "text",
          fields: { keyword: { type: "keyword" } }
        },
        description: { type: "text" },
        body: { type: "text" },
        headings: { type: "text" },
        topics: { type: "keyword" },
        audience: { type: "keyword" },
        decision_stage: { type: "keyword" },
        problems: { type: "text" },
        search_profile: { type: "text" }
      }
    }
  });
}

if (process.argv[2] === "setup") {
  await setupIndex();
  console.log(`Created index ${INDEX_NAME}`);
}
