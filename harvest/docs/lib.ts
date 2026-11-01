import { config } from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

config({ path: [".env.local", ".env.secrets.local"], quiet: true });

export const DATA_DIR = path.resolve("data");
export const DOCS_DIR = path.join(DATA_DIR, "docs");
export const ENRICHED_DIR = path.join(DATA_DIR, "enriched");
export const LOADED_DIR = path.join(DATA_DIR, "loaded");

export const USER_AGENT =
  "Mozilla/5.0 (compatible; OneHackneyHackathon/0.1; +https://github.com/vasegu/Ragtag)";

export const CHAT_MODEL = process.env.CHAT_MODEL ?? "openai/gpt-5.4-mini";
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small";

/** A unit of source text. Chunks are built from contiguous block ranges, never rewritten. */
export type Block = {
  kind: "heading" | "text" | "list" | "table";
  text: string;
  /** Heading level (2-4) for heading blocks. */
  level?: number;
  /** HTML id for headings, used to deep-link citations. */
  anchor?: string;
};

export type RawDoc = {
  url: string;
  title: string;
  kind: "page" | "pdf" | "national";
  source: string;
  breadcrumb: string[];
  lastmod?: string;
  blocks: Block[];
  /** Absolute links found in the content: [text, href]. */
  links: [string, string][];
};

export type Chunk = { idx: number; heading?: string; anchor?: string; content: string };

export type EnrichedDoc = RawDoc & {
  service_area: string;
  summary: string;
  tasks: string[];
  facts: string[];
  form_links: { label: string; url: string }[];
  chunks: Chunk[];
  split: "llm" | "headings";
};

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

export function docId(url: string) {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

export async function writeJson(dir: string, name: string, value: unknown) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${name}.json`), JSON.stringify(value));
}

export async function readJson<T>(dir: string, name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(dir, `${name}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function listJson(dir: string) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function openai() {
  return new OpenAI({
    apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_BASE_URL,
  });
}

export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
}

/** Render blocks as the plain text stored in a chunk. */
export function renderBlocks(blocks: Block[]) {
  return blocks
    .map((b) => (b.kind === "heading" ? `${"#".repeat(b.level ?? 2)} ${b.text}` : b.text))
    .join("\n");
}
