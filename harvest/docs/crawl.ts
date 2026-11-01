// Step 1: fetch every sitemap page, linked hackney.gov.uk PDFs and the national set,
// and cache each as a RawDoc of numbered blocks under data/docs/.
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import pLimit from "p-limit";
import { extractText, getDocumentProxy } from "unpdf";
import { NATIONAL_URLS } from "./national";
import {
  type Block,
  DOCS_DIR,
  type RawDoc,
  USER_AGENT,
  docId,
  listJson,
  readJson,
  sleep,
  writeJson,
} from "./lib";

const SITEMAP = "https://hackney.gov.uk/sitemap.xml";
const MAX_PDFS = Number(process.env.MAX_PDFS ?? 300);
const MAX_PDF_PAGES = 50;
const LIMIT = Number(process.env.CRAWL_LIMIT ?? Infinity);
const CONCURRENCY = 3;
const DELAY_MS = 1000; // 3 workers x 1 req/s each = ~3 req/s

const CONTENT_SELECTORS = [".region-content", ".govuk-govspeak", "main article", "main", "article"];
const DROP_SELECTORS = [
  "script", "style", "noscript", "nav", "form", "button", "svg",
  ".breadcrumbs", ".lgd-page-title-block", ".govuk-breadcrumbs", ".gem-c-print-link",
  ".gem-c-contextual-sidebar", ".gem-c-related-navigation", ".govuk-footer",
  ".gem-c-single-page-notification-button", "[aria-hidden=true]",
];

async function fetchWithRetry(url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, redirect: "follow" });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt === 2) throw err;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error("unreachable");
}

async function sitemapUrls() {
  const urls = new Map<string, string | undefined>();
  // Past the last page, Drupal serves page 1 again, so stop at the first repeat.
  for (let page = 1; page <= 50; page++) {
    const xml = await (await fetchWithRetry(`${SITEMAP}?page=${page}`)).text();
    const $ = cheerio.load(xml, { xml: true });
    const found = $("url")
      .map((_, el) => ({ url: $(el).find("loc").text().trim(), lastmod: $(el).find("lastmod").text().trim() || undefined }))
      .get();
    if (found.length === 0 || urls.has(found[0].url)) break;
    for (const f of found) urls.set(f.url, f.lastmod);
  }
  return [...urls].map(([url, lastmod]) => ({ url, lastmod }));
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Turn the main content area into ordered blocks, keeping links inline as markdown. */
function htmlToBlocks($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>, baseUrl: string) {
  const blocks: Block[] = [];
  const links: [string, string][] = [];

  root.find("a[href]").each((_, a) => {
    const href = $(a).attr("href")!;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const abs = new URL(href, baseUrl).toString();
      const text = clean($(a).text());
      links.push([text, abs]);
      if (text) $(a).replaceWith(`[${text}](${abs})`);
    } catch {
      // ignore malformed hrefs
    }
  });

  root.find("h2, h3, h4, p, li, tr, dt, dd, blockquote").each((_, el) => {
    const $el = $(el);
    // Skip elements nested in another captured element (e.g. <p> inside <li>).
    if ($el.parents("p, li, tr, dt, dd, blockquote").length > 0) return;
    const tag = el.tagName.toLowerCase();
    if (tag === "li" && $el.children("ul, ol").length > 0) {
      const own = clean($el.clone().children("ul, ol").remove().end().text());
      if (own) blocks.push({ kind: "list", text: `- ${own}` });
      return;
    }
    const text = clean(
      tag === "tr" ? $el.children("th, td").map((_, c) => clean($(c).text())).get().join(" | ") : $el.text(),
    );
    if (!text) return;
    if (/^h[2-4]$/.test(tag)) {
      blocks.push({ kind: "heading", text, level: Number(tag[1]), anchor: $el.attr("id") || undefined });
    } else if (tag === "li") {
      blocks.push({ kind: "list", text: `- ${text}` });
    } else if (tag === "tr") {
      blocks.push({ kind: "table", text });
    } else {
      blocks.push({ kind: "text", text });
    }
  });

  return { blocks, links };
}

async function crawlHtml(url: string, kind: RawDoc["kind"], lastmod?: string): Promise<RawDoc | null> {
  const res = await fetchWithRetry(url);
  if (!res.ok || !res.headers.get("content-type")?.includes("html")) return null;
  const $ = cheerio.load(await res.text());
  const title = clean($("h1").first().text()) || clean($("title").text());
  const breadcrumb = $(".breadcrumbs__link, .govuk-breadcrumbs__link")
    .map((_, e) => clean($(e).text()))
    .get()
    .filter((t) => t && t !== "Home");
  $(DROP_SELECTORS.join(",")).remove();
  const root = CONTENT_SELECTORS.map((s) => $(s).first()).find((r) => r.length > 0) ?? $("body");
  const { blocks, links } = htmlToBlocks($, root, res.url);
  if (blocks.length === 0) return null;
  return {
    url: res.url,
    title,
    kind,
    source: new URL(res.url).hostname.replace(/^www\./, ""),
    breadcrumb,
    lastmod,
    blocks,
    links,
  };
}

async function crawlPdf(url: string, title: string): Promise<RawDoc | null> {
  const res = await fetchWithRetry(url);
  if (!res.ok || !res.headers.get("content-type")?.includes("pdf")) return null;
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
  if (pdf.numPages > MAX_PDF_PAGES) return null;
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text as string[];
  const blocks: Block[] = pages.flatMap((page) =>
    page
      .split(/\n\s*\n/)
      .map(clean)
      .filter((t) => t.length > 0)
      .map((t) => ({ kind: "text" as const, text: t })),
  );
  // Scanned PDFs have little or no extractable text.
  if (blocks.reduce((n, b) => n + b.text.length, 0) < 200 * Math.min(pdf.numPages, 3)) return null;
  return {
    url: res.url,
    title: title || decodeURIComponent(new URL(url).pathname.split("/").pop() ?? url),
    kind: "pdf",
    source: "hackney.gov.uk",
    breadcrumb: [],
    blocks,
    links: [],
  };
}

const isPdfLink = (href: string) => {
  const u = new URL(href);
  return (
    u.hostname.endsWith("hackney.gov.uk") &&
    (/\.pdf$/i.test(u.pathname) || /\/media\/\d+\/download/.test(u.pathname))
  );
};

async function main() {
  const done = new Set(await listJson(DOCS_DIR));
  const limit = pLimit(CONCURRENCY);
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  const run = (key: string, job: () => Promise<RawDoc | null>) =>
    limit(async () => {
      if (done.has(docId(key))) return readJson<RawDoc>(DOCS_DIR, docId(key));
      try {
        const doc = await job();
        await sleep(DELAY_MS);
        if (!doc) {
          skipped++;
          return null;
        }
        await writeJson(DOCS_DIR, docId(key), doc);
        done.add(docId(key));
        if (++fetched % 50 === 0) console.log(`fetched ${fetched} (skipped ${skipped}, failed ${failed})`);
        return doc;
      } catch (err) {
        failed++;
        console.warn(`failed ${key}: ${(err as Error).message}`);
        return null;
      }
    });

  const pages = (await sitemapUrls()).slice(0, LIMIT);
  console.log(`sitemap: ${pages.length} pages`);
  const pageDocs = await Promise.all(pages.map((p) => run(p.url, () => crawlHtml(p.url, "page", p.lastmod))));

  // PDFs linked from Hackney pages, most-linked first, capped.
  const pdfCounts = new Map<string, { title: string; count: number }>();
  for (const doc of pageDocs) {
    for (const [text, href] of doc?.links ?? []) {
      if (!isPdfLink(href)) continue;
      const entry = pdfCounts.get(href) ?? { title: text, count: 0 };
      entry.count++;
      pdfCounts.set(href, entry);
    }
  }
  const pdfs = [...pdfCounts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, MAX_PDFS);
  console.log(`pdfs: ${pdfCounts.size} linked, crawling ${pdfs.length}`);
  await Promise.all(pdfs.map(([href, { title }]) => run(href, () => crawlPdf(href, title))));

  // National set, plus gov.uk publication HTML attachments.
  const national = await Promise.all(NATIONAL_URLS.map((u) => run(u, () => crawlHtml(u, "national"))));
  const attachments = national.flatMap((doc, i) => {
    const base = new URL(NATIONAL_URLS[i]);
    if (!doc || !base.pathname.startsWith("/government/publications/")) return [];
    return doc.links
      .map(([, href]) => href.split("#")[0])
      .filter((href) => {
        const u = new URL(href);
        return u.hostname === base.hostname && u.pathname.startsWith(`${base.pathname}/`);
      });
  });
  await Promise.all([...new Set(attachments)].map((u) => run(u, () => crawlHtml(u, "national"))));

  console.log(`done: ${done.size} docs cached (this run fetched ${fetched}, skipped ${skipped}, failed ${failed})`);
}

main();
