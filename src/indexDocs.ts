import path from "node:path";
import { fileURLToPath } from "node:url";
import { INDEX_NAME, createElasticsearchClient, setupIndex } from "./elasticsearch.js";
import { loadSearchDocuments } from "./parseMarkdown.js";

export async function indexDocuments(): Promise<number> {
  const client = createElasticsearchClient();
  const docs = await loadSearchDocuments();
  await setupIndex(client);

  const operations = docs.flatMap((doc) => [{ index: { _index: INDEX_NAME, _id: doc.id } }, doc]);
  const response = await client.bulk({ refresh: true, operations });

  if (response.errors) {
    const failed = response.items.filter((item) => item.index?.error);
    throw new Error(`Bulk indexing failed for ${failed.length} documents`);
  }

  return docs.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const count = await indexDocuments();
  console.log(`Indexed ${count} documents into ${INDEX_NAME}`);
}
