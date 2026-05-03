import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { z } from "zod";
import { buildSearchProfile } from "./buildSearchProfile.js";
import type { PageMetadata, ParsedMarkdownPage, SearchDocument } from "./types.js";

const metadataSchema = z.array(
  z.object({
    id: z.string().min(1),
    source_file: z.string().min(1),
    decision_stage: z.enum([
      "retrieval_strategy",
      "semantic_implementation",
      "hybrid_reranking",
      "vector_tuning",
      "retrieval_evaluation",
      "semantic_migration"
    ]),
    audience: z.array(z.string()).default([]),
    topics: z.array(z.string()).default([]),
    problems: z.array(z.string()).default([])
  })
);

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const contentDir = path.join(projectRoot, "content", "pages");
export const metadataPath = path.join(projectRoot, "data", "page-metadata.json");

function cleanHeading(raw: string): string {
  return raw.replace(/\s+\[[^\]]+\]\s*$/u, "").trim();
}

function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/[*_~>#-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function parseMarkdown(sourceFile: string, rawMarkdown: string): ParsedMarkdownPage {
  const parsed = matter(rawMarkdown);
  const headingMatches = [...parsed.content.matchAll(/^#{1,6}\s+(.+)$/gmu)];
  const headings = headingMatches.map((match) => cleanHeading(match[1])).filter(Boolean);
  const title = headings[0] ?? String(parsed.data.navigation_title ?? sourceFile.replace(/\.md$/u, ""));
  const id = sourceFile.replace(/\.md$/u, "");

  return {
    id,
    source_file: sourceFile,
    title,
    description: String(parsed.data.description ?? ""),
    frontmatter: parsed.data,
    headings,
    body: markdownToPlainText(parsed.content)
  };
}

export async function loadMetadata(filePath = metadataPath): Promise<PageMetadata[]> {
  const raw = await fs.readFile(filePath, "utf8");
  return metadataSchema.parse(JSON.parse(raw));
}

export async function loadSearchDocuments(
  pagesDir = contentDir,
  metadataFile = metadataPath
): Promise<SearchDocument[]> {
  const metadata = await loadMetadata(metadataFile);
  const metadataByFile = new Map(metadata.map((entry) => [entry.source_file, entry]));
  const files = (await fs.readdir(pagesDir)).filter((file) => file.endsWith(".md")).sort();

  return Promise.all(
    files.map(async (sourceFile) => {
      const raw = await fs.readFile(path.join(pagesDir, sourceFile), "utf8");
      const parsed = parseMarkdown(sourceFile, raw);
      const meta = metadataByFile.get(sourceFile);
      if (!meta) {
        throw new Error(`Missing metadata for ${sourceFile}`);
      }

      return {
        ...parsed,
        ...meta,
        search_profile: buildSearchProfile({ ...parsed, ...meta })
      };
    })
  );
}
