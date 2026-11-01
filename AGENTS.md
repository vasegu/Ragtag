# One Hackney (Ragtag)

Hackathon build: one front door for Hackney residents. Part 1 is **Ask**, a cited
AI search over everything on hackney.gov.uk, replacing the council's site search
(which answers "i want to pay my council tax" with a care-home page).

## Demo goal

A resident asks a plain-English question (any language) and gets a short answer
with citations and a link straight to the right Hackney page or form. When the
corpus doesn't cover it, the agent says so and says who to contact.

## Ownership

| Area | Owner | Paths |
|---|---|---|
| Docs pipeline + chat backend | Vasco | `harvest/docs/`, `src/lib/`, `src/app/api/`, `supabase/` |
| One Hackney UI | UI teammate | `src/app/` pages and `src/components/` |
| FixMyStreet harvest | Manjeev | `harvest/fixmystreet/` |

Don't edit the other side's paths without asking. The UI talks to the backend
only through the HTTP endpoints below.

## Stack

- Next.js 15 (App Router) on Vercel, project `acn-rx-geek-out/ragtag`. Pushes to `main` deploy.
- Supabase (org ACN-RX-GeekOut, project `ragtag`, eu-west-2): Postgres + pgvector + full-text search.
- OpenAI Agents SDK (`@openai/agents`) for the agent; models go through Vercel AI Gateway
  for now (`AI_BASE_URL`, `AI_GATEWAY_API_KEY`). Switching to OpenAI direct = change those two env vars.
- Models: `openai/gpt-5.4-mini` (answers, page enrichment), `openai/text-embedding-3-small` (1536 dims).

## Env files (all gitignored)

- `.env.local`: Supabase URL + publishable key. Safe to share with the team.
- `.env.secrets.local`: AI gateway key, Supabase secret key, DB password. Never share in public channels.
- `.env.example`: names only, committed.

## Endpoints (the UI contract)

- `POST /api/chat` with `{ message: string, history?: AgentInputItem[] }`. For follow-ups, send
  back the `history` from the previous `done` event. Responds with newline-delimited JSON
  (one event per line), Agents SDK stream events passed through:
  - `{ type: "raw_model_stream_event", data: { type: "output_text_delta", delta } }`: answer text; append `delta`.
  - `{ type: "run_item_stream_event", name: "tool_called" | "tool_output" | "message_output_created", item }`:
    use `tool_called` with `item.rawItem.name === "search_hackney"` to show "Searching…".
  - `{ type: "done", history, sources: Source[], refused? }`: `Source` is `{ n, title, heading, url, kind, serviceArea }`
    (see `src/lib/agent.ts`). The answer cites sources as `[n]`; render those as links to `sources[n-1].url`.
  - `{ type: "error", message }` if something broke mid-stream.
  Add `?mock=1` for a canned response with no AI calls.
- `GET /api/search?q=...&area=...` returns `{ results: SearchResult[] }` (see `src/lib/search.ts`).

## Ingest pipeline

Run locally with `npm run ingest:<step>`. Each step caches output under `data/` (gitignored), so re-runs are cheap.

1. `crawl`: sitemap -> fetch pages (3 req/s) -> main content as numbered blocks; linked hackney.gov.uk PDFs (max 300, <=50 pages, skip scanned).
2. `enrich`: one LLM call per document returns chunk boundaries (block ranges) + summary, service area, resident task phrases, facts, form links. Code rebuilds chunks from the original blocks and verifies every block is used exactly once; on failure it falls back to heading splits.
3. `load`: embed chunk text (title + breadcrumb + tasks + content) and upsert into Supabase.
4. `eval`: score Hackney's own search vs ours on `harvest/docs/eval/questions.json`.

## Done when

- `npm run build` passes and `npm run lint` is clean.
- `npm run ingest:eval` shows our hit rate beats Hackney's site search.
- Every answer cites a source URL that exists in `documents`.
