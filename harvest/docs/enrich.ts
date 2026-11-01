// Step 2: one LLM call per document. The model sees numbered blocks and returns
// chunk boundaries plus metadata. Chunk text is always rebuilt from the original
// blocks, and every block must be used exactly once, or we fall back to headings.
import pLimit from "p-limit";
import { z } from "zod";
import {
  type Block,
  CHAT_MODEL,
  type Chunk,
  DOCS_DIR,
  ENRICHED_DIR,
  type EnrichedDoc,
  type RawDoc,
  SERVICE_AREAS,
  listJson,
  openai,
  readJson,
  renderBlocks,
  writeJson,
} from "./lib";

const CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY ?? 16);
const MAX_BLOCKS_FOR_LLM = 400; // Very long docs skip the LLM split and use headings.
const MAX_CHUNK_CHARS = 3500;

const Enrichment = z.object({
  service_area: z.enum(SERVICE_AREAS),
  summary: z.string(),
  tasks: z.array(z.string()),
  facts: z.array(z.string()),
  form_links: z.array(z.object({ label: z.string(), url: z.string() })),
  chunks: z.array(z.object({ start: z.number().int(), end: z.number().int(), title: z.string() })),
});
type Enrichment = z.infer<typeof Enrichment>;

const SYSTEM = `You prepare London Borough of Hackney council web content for a resident-facing search engine.
You get a document as numbered blocks. Return JSON with:
- service_area: the single best fit from the allowed list.
- summary: 1-2 plain-English sentences on what this page helps a resident do or know.
- tasks: 3-8 short phrases a resident might type to find this page, in their words, e.g. "pay my council tax", "my bin wasn't collected", "get a parking permit for a visitor". Empty if the page is navigation only.
- facts: up to 8 concrete facts: eligibility rules, deadlines, amounts, opening hours, phone numbers. Copy figures exactly.
- form_links: links (from the markdown in the blocks) to online forms, payment pages or applications, with a short label.
- chunks: split the blocks into self-contained topical sections as inclusive block ranges {start, end, title}. Ranges must be contiguous, in order, start at 0, end at the last block, and cover every block exactly once. Aim for 150-600 words per chunk; never split a list or table from the sentence that introduces it.`;

function headingChunks(blocks: Block[]): { start: number; end: number; title: string }[] {
  const ranges: { start: number; end: number; title: string }[] = [];
  let start = 0;
  let size = 0;
  blocks.forEach((b, i) => {
    const isBreak = i > start && ((b.kind === "heading" && (b.level ?? 2) <= 3) || size + b.text.length > MAX_CHUNK_CHARS);
    if (isBreak) {
      ranges.push({ start, end: i - 1, title: "" });
      start = i;
      size = 0;
    }
    size += b.text.length;
  });
  ranges.push({ start, end: blocks.length - 1, title: "" });
  return ranges;
}

function validRanges(ranges: { start: number; end: number }[], n: number) {
  let next = 0;
  for (const r of ranges) {
    if (r.start !== next || r.end < r.start || r.end >= n) return false;
    next = r.end + 1;
  }
  return next === n;
}

/** Split any range whose text is too long for one chunk at its block boundaries. */
function capRanges(ranges: { start: number; end: number; title: string }[], blocks: Block[]) {
  return ranges.flatMap((r) => {
    const out: typeof ranges = [];
    let start = r.start;
    let size = 0;
    for (let i = r.start; i <= r.end; i++) {
      if (i > start && size + blocks[i].text.length > MAX_CHUNK_CHARS) {
        out.push({ start, end: i - 1, title: r.title });
        start = i;
        size = 0;
      }
      size += blocks[i].text.length;
    }
    out.push({ start, end: r.end, title: r.title });
    return out;
  });
}

function buildChunks(doc: RawDoc, ranges: { start: number; end: number; title: string }[]): Chunk[] {
  return capRanges(ranges, doc.blocks).map((r, idx) => {
    const slice = doc.blocks.slice(r.start, r.end + 1);
    // Nearest heading at or before the chunk start gives the deep-link anchor.
    const heading = [...doc.blocks.slice(0, r.start + 1)].reverse().find((b) => b.kind === "heading");
    return {
      idx,
      heading: r.title || heading?.text || doc.title,
      anchor: heading?.anchor,
      content: renderBlocks(slice),
    };
  });
}

async function enrich(doc: RawDoc): Promise<EnrichedDoc> {
  const numbered = doc.blocks.map((b, i) => `[${i}] ${b.kind === "heading" ? `${"#".repeat(b.level ?? 2)} ` : ""}${b.text}`);
  const tooLong = doc.blocks.length > MAX_BLOCKS_FOR_LLM;
  const user = [
    `Allowed service areas: ${SERVICE_AREAS.join(", ")}`,
    `Title: ${doc.title}`,
    `Breadcrumb: ${doc.breadcrumb.join(" > ") || "(none)"}`,
    `Source: ${doc.source} (${doc.kind})`,
    `Blocks (${doc.blocks.length}):`,
    // For very long docs, send the start only: enough for metadata, chunks come from headings.
    ...(tooLong ? numbered.slice(0, 120) : numbered),
  ].join("\n");

  const res = await openai().chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });
  const parsed: Enrichment = Enrichment.parse(JSON.parse(res.choices[0].message.content ?? "{}"));

  const llmOk = !tooLong && validRanges(parsed.chunks, doc.blocks.length);
  const ranges = llmOk ? parsed.chunks : headingChunks(doc.blocks);
  return {
    ...doc,
    service_area: parsed.service_area,
    summary: parsed.summary,
    tasks: parsed.tasks,
    facts: parsed.facts,
    form_links: parsed.form_links.filter((l) => /^https?:\/\//.test(l.url)),
    chunks: buildChunks(doc, ranges),
    split: llmOk ? "llm" : "headings",
  };
}

async function main() {
  const ids = await listJson(DOCS_DIR);
  const done = new Set(await listJson(ENRICHED_DIR));
  const todo = ids.filter((id) => !done.has(id)).slice(0, Number(process.env.ENRICH_LIMIT ?? Infinity));
  console.log(`enrich: ${todo.length} to do, ${done.size} cached`);
  const limit = pLimit(CONCURRENCY);
  let n = 0;
  let llm = 0;
  let failed = 0;
  await Promise.all(
    todo.map((id) =>
      limit(async () => {
        const doc = await readJson<RawDoc>(DOCS_DIR, id);
        if (!doc) return;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const out = await enrich(doc);
            await writeJson(ENRICHED_DIR, id, out);
            if (out.split === "llm") llm++;
            break;
          } catch (err) {
            if (attempt === 1) {
              failed++;
              console.warn(`failed ${doc.url}: ${(err as Error).message.slice(0, 200)}`);
            }
          }
        }
        if (++n % 100 === 0) console.log(`enriched ${n}/${todo.length} (llm splits ${llm}, failed ${failed})`);
      }),
    ),
  );
  console.log(`done: ${n} processed, ${llm} LLM splits, ${n - llm - failed} heading fallbacks, ${failed} failed`);
}

main();
