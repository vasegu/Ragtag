// Step 4: score our hybrid search against Hackney's own site search.
// Our side runs automatically. Hackney's /search is disallowed for bots in robots.txt,
// so record its top 3 result URLs by hand in questions.json ("hackney": [...]).
// `npm run ingest:eval -- --links` prints the Hackney search URLs to open.
import { readFile } from "node:fs/promises";
import { EMBEDDING_MODEL, openai, supabaseAdmin } from "../lib";

type Question = { q: string; expect: string[]; hackney: string[] | null };

const K = 3;
const hit = (urls: string[], expect: string[]) => urls.slice(0, K).some((u) => expect.some((e) => u.includes(e)));

async function ours(q: string) {
  const e = await openai().embeddings.create({ model: EMBEDDING_MODEL, input: q });
  const { data, error } = await supabaseAdmin().rpc("hybrid_search", {
    query_text: q,
    query_embedding: JSON.stringify(e.data[0].embedding),
    match_count: 10,
  });
  if (error) throw new Error(error.message);
  // Several chunks can come from one page; rank by distinct page.
  return [...new Set((data as { url: string }[]).map((r) => r.url))];
}

async function main() {
  const questions: Question[] = JSON.parse(await readFile("harvest/docs/eval/questions.json", "utf8"));
  if (process.argv.includes("--links")) {
    for (const { q } of questions) console.log(`${q}\n  https://hackney.gov.uk/search?s=${encodeURIComponent(q)}`);
    return;
  }

  let oursHits = 0;
  let hackneyHits = 0;
  let hackneyScored = 0;
  for (const { q, expect, hackney } of questions) {
    const urls = await ours(q);
    const ok = hit(urls, expect);
    oursHits += Number(ok);
    let theirs = "  n/a";
    if (hackney) {
      hackneyScored++;
      const h = hit(hackney, expect);
      hackneyHits += Number(h);
      theirs = h ? "  hit" : " miss";
    }
    console.log(`${ok ? " hit" : "miss"} |${theirs} | ${q}\n      ours: ${urls[0] ?? "(none)"}`);
  }
  console.log(`\nours: ${oursHits}/${questions.length} top-${K} hits`);
  console.log(`hackney: ${hackneyHits}/${hackneyScored} top-${K} hits (${questions.length - hackneyScored} not recorded yet)`);
}

main();
