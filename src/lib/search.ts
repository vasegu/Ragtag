import { createClient } from "@supabase/supabase-js";
import { embed } from "./ai";

export const SERVICE_AREAS = [
  "council-tax",
  "benefits-and-financial-help",
  "housing",
  "housing-repairs",
  "bins-and-recycling",
  "streets-and-roads",
  "parking",
  "planning-and-building-control",
  "environmental-health-and-noise",
  "schools-and-education",
  "children-and-families",
  "adult-social-care-and-health",
  "libraries-leisure-and-parks",
  "births-deaths-marriages-and-citizenship",
  "business-and-licensing",
  "community-safety",
  "council-democracy-and-jobs",
  "complaints-and-rights",
  "other",
] as const;
export type ServiceArea = (typeof SERVICE_AREAS)[number];

export type SearchResult = {
  chunkId: number;
  documentId: number;
  title: string;
  heading: string | null;
  /** Source URL, with #anchor to the section when the page has one. */
  url: string;
  kind: "page" | "pdf" | "national";
  serviceArea: string | null;
  content: string;
  score: number;
};

type Row = {
  chunk_id: number;
  document_id: number;
  url: string;
  title: string;
  kind: SearchResult["kind"];
  service_area: string | null;
  heading: string | null;
  anchor: string | null;
  content: string;
  score: number;
};

// The corpus is public, so the publishable key is enough to search it.
const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });

export async function hybridSearch(query: string, opts: { area?: string | null; count?: number } = {}) {
  const embedding = await embed(query);
  const { data, error } = await db().rpc("hybrid_search", {
    query_text: query,
    query_embedding: JSON.stringify(embedding),
    match_count: opts.count ?? 8,
    filter_area: opts.area ?? null,
  });
  if (error) throw new Error(`hybrid_search: ${error.message}`);
  return (data as Row[]).map(
    (r): SearchResult => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      title: r.title,
      heading: r.heading,
      url: r.anchor ? `${r.url}#${r.anchor}` : r.url,
      kind: r.kind,
      serviceArea: r.service_area,
      content: r.content,
      score: r.score,
    }),
  );
}

export async function getPage(url: string) {
  const client = db();
  const { data: doc, error } = await client
    .from("documents")
    .select("id, url, title, kind, summary, facts, form_links")
    .eq("url", url.split("#")[0])
    .maybeSingle();
  if (error) throw new Error(`getPage: ${error.message}`);
  if (!doc) return null;
  const { data: chunks } = await client.from("chunks").select("content").eq("document_id", doc.id).order("idx");
  return { ...doc, content: (chunks ?? []).map((c) => c.content).join("\n\n") };
}
