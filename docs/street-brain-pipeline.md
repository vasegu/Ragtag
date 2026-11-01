# Street Brain pipeline in Ragtag

Entry: `/ask` → **Report an issue** → `/street-report`. Five-stage visual: `/street-report/pipeline`. New APIs are under `/api/street-brain/`. Existing Ask, map, classifier and queue contracts are retained.

## Five stages

1. Validate relevance: Decisions predicate. A selfie alone is rejected; people beside a real defect are allowed.
2. Classify: Decisions choice from the exact 24 supplied categories. Unknown is allowed.
3. Check responsibility: Decisions choice plus location evidence. TfL/utility/private cases route for confirmation; imminent danger still gets safety review.
4. Assess harm: category-specific evidence, Decisions rubric distributions, and deterministic proposed S0/S1/S2/S3/U rules. The visible 1–5 rating is provisional. An unscaled photo does not establish depth. A normal vision call extracts the council description, qualitative extent, risk position and missing evidence.
5. Prepare repair needs and rank: propose actions, trade, material types and equipment; quantities and availability stay unconfirmed. Immediate safety review comes first, then staff-confirmed obligations due within 24 hours, evidence review, suggested severity and age. No automated worker dispatch or promised repair date.

## Supabase project owner: one-time setup

The shared project is `sqntdvwduumyguxdjxdf`. The current browser user cannot open its SQL editor, so an owner needs to do this:

1. Run `supabase/migrations/20261101143000_street_brain_pipeline.sql` in the shared project's SQL Editor. It creates separate `street_assessments` and `street_pipeline_jobs` tables and two **private** buckets. It does not change harvested `reports`, `report_photos`, or `report_updates`.
2. In Database Webhooks create an **INSERT** webhook on `storage.objects`.
3. Set the HTTP POST URL to `https://ragtag-kappa.vercel.app/api/street-brain/pipeline/webhook`.
4. Add `Authorization: Bearer <PIPELINE_WEBHOOK_SECRET>` and `Content-Type: application/json`. Copy the secret from the local ignored `.env.secrets.local` or the Ragtag Vercel environment settings. Never put it in source control. If the target deployment is protected by Vercel authentication, its project owner must configure an approved automation bypass and add the `x-vercel-protection-bypass` header. The app Bearer secret does not bypass Vercel authentication. Public production endpoints do not need that extra header.
5. Test a new image in `street-brain-uploads`. Historical `images` uploads are ignored by this webhook. Updates/overwrites are not a new upload; use a new object path for every report.

New objects can provide `user_metadata` with `address`, `description`, and an optional `location` object (`label`, `lat`, `lon`, `borough`, `source: "OpenStreetMap / Nominatim"`). Missing location or description produces review-needed evidence, never invented data. For photo batches, include `photoIndex`, `photoCount`, and `photoPaths`; only the last upload triggers the batch.

The resident form uploads its batch and enqueues the same durable job directly, so it does not depend on webhook delivery for its own submissions once the tables/buckets exist. The webhook handles other applications uploading to the new bucket.

## Job lifecycle and limits

`pending → processing → completed | failed`. A unique bucket/path/mode key deduplicates events; a conditional database update allows only one worker to claim a pending job. Outcomes are persisted separately from source records. Backtests cannot enter the live queue.

Processing runs through Next.js `after()` on Vercel. Failed jobs stay visible and can be retried through the staff-only `POST /api/street-brain/pipeline/run` endpoint (`{ "jobId": "..." }`), up to three attempts. This is not an automatic retry scheduler; configure a durable queue/periodic drain before relying on unattended production recovery. Review/reclaim a stale processing job after an interrupted worker; do not run simultaneous replacements.

Every outcome includes a five-stage `decisionTrace`: observable evidence, branch taken, confidence when returned by Decisions, policy references and missing facts. This is an audit explanation, not hidden model reasoning. The overall confidence field is the minimum of category, responsibility and severity confidence; it is an uncalibrated routing signal, not a measured accuracy rate.

Invalid images are rejected and excluded from the council priority queue. Input photos remain private in the raw upload bucket until an authorised retention/deletion process removes them.

## Backtesting

The council workspace's Category backtesting panel selects existing `report_photos.storage_path` images and retains the `reports.category` field as an evaluation label. Expected category is never sent to the model. It displays exact category agreement and mismatches, separately from live submissions. A source label is a weak label, not verified truth; this is not evidence of safety calibration or urgency accuracy. Run deliberately selected samples; there is no automatic paid batch.

## Keys and access

For this team repository, local backend secrets belong in ignored `.env.secrets.local`; public values belong in `.env.local`. The required variables are listed in `.env.example`. The Ragtag Vercel project needs its own server variables. Configuring the separate ACC_T preview does not configure Ragtag production. `COUNCIL_ACCESS_CODE` opens the staff view; it is separate from any Supabase account password. Change exposed credentials directly in the provider settings and local/Vercel environment variables, then redeploy.

The server uses the Supabase secret/service-role key; it never sends that key to the browser. The SQL tables deny anon/authenticated access. Signed photo URLs expire after ten minutes. The council sign-in uses an HttpOnly cookie. The in-memory request limit is suitable for this protected hackathon preview; use a distributed rate limiter before a public production rollout.

## Open data and policy

OpenStreetMap/Nominatim locates a selected address; Overpass returns nearby schools, universities, bus stops and stations with distances and source IDs. These are potential-exposure context, never footfall counts or automatic score bonuses. STATS19 is **not connected**; no collision history or causation is claimed.

Policy version 0.3.0 is proposed and uncalibrated. Full source documents are retained locally in `policies/`; the deployed model uses the corresponding assessment excerpt. Published targets are not deadlines until ownership, scope, action and clock origin are confirmed. A qualified worker must confirm final severity and dispatch resources.

## Verification

`npm run test:street-brain` checks rejection, routing, safety precedence, uncertainty and empty/error response handling. `npm run build` verifies the app. A real Decisions + report-generation smoke call was checked in the isolated app before this integration, without creating a council record. One team pothole sample returned the safety category, suggested severity 3/5, U/unassessed and a resource proposal; this is a smoke check, not an accuracy result.

## Ragtag integration

The live app entry is `/street-report`, linked from `/ask`. The explainer is `/street-report/pipeline`. All new HTTP routes are under `/api/street-brain/`; existing `/api/classify`, `/api/queue`, `/report` and the Ask agent retain their contracts. Run `npm run test:street-brain` for this feature. Required new server variables: `OPENAI_API_KEY`, `COUNCIL_ACCESS_CODE`, `PIPELINE_WEBHOOK_SECRET`. Optional bucket/table/model overrides are documented in `.env.example`. No credentials are included in Git. The team project owner must configure its own Vercel variables; settings in the separate ACC_T preview project do not configure Ragtag production.
