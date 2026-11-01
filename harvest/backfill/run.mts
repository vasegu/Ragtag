// Backfill: run Santiago's street brain pipeline over existing open FixMyStreet reports that
// have a photo, in backtest mode. Each gets a decision trace, a work order and a problem_jobs row.
//
//   npx tsx harvest/backfill/run.mts            # all open reports with photos
//   LIMIT=3 npx tsx harvest/backfill/run.mts    # try a few first
//
// Re-running is safe: reports that already have a backtest assessment are skipped.
import { config } from "dotenv";
config({ path: [".env.local", ".env.secrets.local"], quiet: true });

const { db } = await import("../../src/features/street-brain/db");
const { enqueueObject, processJob } = await import("../../src/features/street-brain/jobs");

const LIMIT = Number(process.env.LIMIT ?? Infinity);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);

type Row = {
  id: number;
  title: string | null;
  detail: string | null;
  category: string | null;
  address: string | null;
  lat: number | null;
  lon: number | null;
  report_photos: { storage_path: string | null }[] | null;
};

const client = db();
const { data, error } = await client
  .from("reports")
  .select("id, title, detail, category, address, lat, lon, report_photos(storage_path)")
  .eq("is_fixed", false)
  .not("lat", "is", null)
  .limit(2000);
if (error) throw new Error(error.message);

const { data: done } = await client.from("street_assessments").select("source_report_id").eq("source_mode", "backtest");
const already = new Set((done ?? []).map((d) => String(d.source_report_id)));

const todo = (data as Row[])
  .map((r) => ({ r, path: r.report_photos?.find((p) => p.storage_path && /\.(jpe?g|png|webp)$/i.test(p.storage_path))?.storage_path }))
  .filter((x): x is { r: Row; path: string } => Boolean(x.path) && !already.has(String(x.r.id)))
  .slice(0, LIMIT);

console.log(`backfill: ${todo.length} to assess (${already.size} already done), ${CONCURRENCY} at a time`);

let ok = 0;
let failed = 0;
const started = Date.now();
const queue = [...todo];
async function worker() {
  for (let item = queue.shift(); item; item = queue.shift()) {
    const { r, path } = item;
    const address = (r.address ?? "Hackney, London").replace(/\.$/, "").slice(0, 380);
    const description = [r.title, r.detail].filter(Boolean).join(". ").slice(0, 2900) || "Report from FixMyStreet";
    try {
      const job = await enqueueObject({
        bucket: "images",
        path,
        mode: "backtest",
        expectedCategory: r.category ?? undefined,
        metadata: {
          address,
          description,
          location: r.lat && r.lon ? { label: address, lat: r.lat, lon: r.lon, borough: "Hackney", source: "OpenStreetMap / Nominatim" } : null,
          sourceReportId: String(r.id),
        },
      });
      await processJob(job.id);
      const { data: after } = await client.from("street_pipeline_jobs").select("status, error").eq("id", job.id).single();
      if (after?.status === "completed") ok++;
      else {
        failed++;
        console.warn(`  ${r.id}: ${after?.status} ${after?.error ?? ""}`.slice(0, 200));
      }
    } catch (e) {
      failed++;
      console.warn(`  ${r.id}: ${(e as Error).message}`.slice(0, 200));
    }
    const n = ok + failed;
    if (n % 10 === 0 || n === todo.length) console.log(`  ${n}/${todo.length} · ${ok} ok · ${failed} failed · ${Math.round((Date.now() - started) / 1000)}s`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done: ${ok} assessed, ${failed} failed in ${Math.round((Date.now() - started) / 1000)}s`);
