// Step 3: embed every chunk and upsert documents + chunks into Supabase.
import pLimit from "p-limit";
import {
  EMBEDDING_MODEL,
  ENRICHED_DIR,
  type EnrichedDoc,
  LOADED_DIR,
  listJson,
  openai,
  readJson,
  supabaseAdmin,
  writeJson,
} from "./lib";

const BATCH = 64; // chunks per embeddings request
const CONCURRENCY = 6;

function embedText(doc: EnrichedDoc, heading: string | undefined, content: string) {
  return [
    doc.title,
    doc.breadcrumb.join(" > "),
    doc.tasks.length ? `Residents ask: ${doc.tasks.join("; ")}` : "",
    heading && heading !== doc.title ? heading : "",
    content,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 24000);
}

async function main() {
  const db = supabaseAdmin();
  const ai = openai();
  // Skip documents already loaded unless RELOAD=1.
  const loadedIds = new Set(process.env.RELOAD ? [] : await listJson(LOADED_DIR));
  const ids = (await listJson(ENRICHED_DIR)).filter((id) => !loadedIds.has(id));
  const limit = pLimit(CONCURRENCY);
  console.log(`load: ${ids.length} documents (${loadedIds.size} already loaded)`);

  // Group documents so each embeddings request carries ~BATCH chunks.
  const docs = (
    await Promise.all(ids.map(async (id) => ({ id, doc: await readJson<EnrichedDoc>(ENRICHED_DIR, id) })))
  ).flatMap(({ id, doc }) => (doc && doc.chunks.length > 0 ? [Object.assign(doc, { id })] : []));
  const groups: (typeof docs)[] = [];
  let current: typeof docs = [];
  let size = 0;
  for (const doc of docs) {
    if (size + doc.chunks.length > BATCH && current.length) {
      groups.push(current);
      current = [];
      size = 0;
    }
    current.push(doc);
    size += doc.chunks.length;
  }
  if (current.length) groups.push(current);

  let loaded = 0;
  let chunkCount = 0;
  await Promise.all(
    groups.map((group) =>
      limit(async () => {
        const rows = group.flatMap((doc) => doc.chunks.map((c) => ({ doc, c, text: embedText(doc, c.heading, c.content) })));
        const res = await ai.embeddings.create({ model: EMBEDDING_MODEL, input: rows.map((r) => r.text) });

        for (const doc of group) {
          const { data, error } = await db
            .from("documents")
            .upsert(
              {
                url: doc.url,
                title: doc.title,
                kind: doc.kind,
                source: doc.source,
                breadcrumb: doc.breadcrumb,
                service_area: doc.service_area,
                summary: doc.summary,
                tasks: doc.tasks,
                facts: doc.facts,
                form_links: doc.form_links,
                lastmod: doc.lastmod ?? null,
                fetched_at: new Date().toISOString(),
              },
              { onConflict: "url" },
            )
            .select("id")
            .single();
          if (error) throw new Error(`${doc.url}: ${error.message}`);

          await db.from("chunks").delete().eq("document_id", data.id);
          const chunkRows = rows
            .map((r, i) => ({ ...r, embedding: res.data[i].embedding }))
            .filter((r) => r.doc === doc)
            .map((r) => ({
              document_id: data.id,
              idx: r.c.idx,
              heading: r.c.heading ?? null,
              anchor: r.c.anchor ?? null,
              content: r.c.content,
              embed_text: r.text,
              embedding: JSON.stringify(r.embedding),
            }));
          const { error: chunkError } = await db.from("chunks").insert(chunkRows);
          if (chunkError) throw new Error(`${doc.url} chunks: ${chunkError.message}`);
          chunkCount += chunkRows.length;
          await writeJson(LOADED_DIR, doc.id, { url: doc.url, chunks: chunkRows.length });
        }
        loaded += group.length;
        if (loaded % 200 < group.length) console.log(`loaded ${loaded}/${docs.length} docs, ${chunkCount} chunks`);
      }),
    ),
  );
  console.log(`done: ${loaded} documents, ${chunkCount} chunks`);
}

main();
