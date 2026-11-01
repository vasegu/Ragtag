# PM Dashboard Implementation Plan

> Execute inline with superpowers:executing-plans. User approved the softened mockup and all four behaviour decisions, and explicitly requested building.

**Goal:** A single-screen PM demo at `/dashboard` for finances, pending repairs, delivery, capacity and action approvals.

**Architecture:** Isolated Next.js route, client dashboard, scoped CSS and a typed deterministic demo model. No APIs, dispatch calls, new dependencies or changes to resident screens. Existing Open Sans and global tokens; softened sage/teal/terracotta palette from the accepted concept.

**Approved design:** `/Users/v.eguren/.codex/generated_images/01a19713-f298-73d2-abca-7f83c386973d/exec-e6444c4c-86ae-4c21-b627-1ba5bad22c87.png`. Summary: finance strip, severity-by-age table and approval queue above delivery and square-block capacity charts. Demo disclosure remains visible. Approvals affect specific proposed actions and persist locally; they do not dispatch work.

## Constraints and review focus

- One coherent fixture drives counts, filters and charts; never infer actual severity from report categories.
- Service filter applies throughout. Period filter changes financial reporting and delivery, not the current backlog/weekly capacity; label periods.
- Derive totals from underlying records. Include explicit emergency and unassessed states; unknown age must not become zero.
- Validate persisted decisions; unavailable/corrupt storage must not crash the page. Request changes/defer require a reason. Approving reserves demo funds without marking a repair complete.
- Accessible labelled controls, keyboard dismissal/focus management for side panels, narrow-screen layout, empty states.

## Tasks

- [x] 1. Add `src/lib/dashboard/model.test.ts` first; run with `npx tsx --test src/lib/dashboard/model.test.ts` and observe missing-feature failure. Implement `model.ts`: records, age bins, period/service aggregates, finances, decisions and storage validation. Check counts, date boundaries, approval idempotency, overspend and corrupt persistence.
- [x] 2. Add `src/app/dashboard/page.tsx`, route-local `Dashboard.tsx`, `dashboard.css`: match concept, native charts, working filters, repair list, approval detail form and local persistence/reset. All controls act on real demo state. No decorative dead navigation.
- [x] 3. Run model tests, existing tests, lint/build. Start server; browser-check desktop/mobile, filters, drill-downs, approval/reload/reset, reasons and keyboard navigation. Compare accepted concept/render and resolve material mismatches. Fresh review before completion.

## Execution ledger

- Approved inline build; no further design checkpoint required.
- Ruling: derive chart bars from fixture timestamps instead of copying inconsistent mockup chart heights. Preserve headline defaults (128 open, 94 fixed, £80k budget / £42k spent / £18k committed).
- Ruling: retain a clearly labelled current snapshot alongside period-based reports. Weekly capacity is proposed, never confirmed dispatch.

- Task 1: complete; seven model tests pass.
- Task 2: implemented; browser verification pending. Existing Street Brain (7) and map (8) tests pass; full lint clean.
- Review: fixed focus restoration after decisions and cross-tab local-storage synchronisation.

## Verification and fidelity ledger

- Browser: built-in IAB, actual CSS viewport 1536×1024; all panels fit without scrolling. Mobile CSS viewport 434×938: stacked panels, no horizontal page overflow, review panel usable. Browser scaling required compensating viewport override; actual dimensions checked from DOM.
- Tested: severity-cell drilldown (3 matching issues), service filter (Lighting 42 open), 7-day delivery filter (Lighting 7 fixes; backlog remains 42), approval (+£240 commitment), reload persistence, required deferral reason, request changes, two-tab synchronization, reset and keyboard Escape/focus restoration.
- Palette: muted teal/sage finance and delivery; subdued terracotta/ochre risk states match softened concept.
- Layout: compact financial strip and two-column panel grid; mobile becomes single-column.
- Typography: inherited Open Sans, deliberate control sizes, charcoal rather than black.
- Containers: 24px corners, existing card shadow, light separators; pill review actions.
- Copy: removed repeated explanations from overview; retained demo disclosure and review evidence. Intentional additions are explicit emergency/unknown-age coverage, current-snapshot/proposed labels and reporting-period boundaries.
- Charts: native SVG/grid, totals derived from fixtures. Intentional difference: trend heights follow coherent underlying timestamps, not illustrative mockup heights.
- Review: independent reviewer confirmed fixes for focus, cross-tab updates and memory-only operation after write failure. Quota failure not injected in browser; persistence parser and decision model covered by tests and storage-failure path reviewed.
- Initial plain build blocked on missing existing AI credentials; temporary build-only placeholder keys used to validate compilation. Missing Supabase URL logs existing report-route fallback; no real AI or council-service integration tested.

- Final verification: 22 tests pass (7 dashboard, 7 Street Brain, 8 map); full lint passes. Production build exits 0 with temporary build-only AI placeholders; existing Supabase fallback warning remains. Final production browser console: no errors/warnings. Production mobile checked at 391×844 without horizontal overflow.
- Final comparison: viewed accepted concept and latest desktop/mobile screenshots directly; layout, palette, typography, spacing, chart treatment and control styles verified. No remaining material visual defects; intentional differences listed above.
- Local preview: http://127.0.0.1:3000/dashboard. Evidence saved outside repo at /tmp/hackney-dashboard-desktop.png and /tmp/hackney-dashboard-mobile.png. Dashboard prepared on feat/pm-dashboard for integration into main.

## Council workspace integration

The `/street-report` Council workspace entry opens `/dashboard` directly with no sign-in prompt. Dashboard branding links back to resident reporting. The legacy live-evidence reviewer remains available as a named component export; protected queue/evaluation/session APIs are unchanged. This public demo does not expose uploaded report photos or assessment records.

## Repairs and scheduler extension — approved

User approved replacing the Repairs demo list with real public reports and an editable, explicitly simulated resource scenario. Build `/dashboard/repairs` and `/dashboard/schedule`, preserving the softened shared design. Use public FixMyStreet reports and publicly readable problem jobs only; private assessments/photos remain protected. Preserve null original dates; never derive priority/deadline from category or use ID-generated risk scores. Source statuses remain distinct from proposed schedule state.

Implementation: (1) Add tested report adapters and priority comparator plus paginated `/api/dashboard/issues`; fail visibly instead of silently seeding. (2) Add a tested deterministic seven-calendar-day scheduler: qualified crews, crew size, shared equipment, consumable stock, budget, working windows, breaks, travel buffer, priorities, policy-target miss reporting and explicit blockers. Unknown scope gets inspection; referral/closed/in-progress work is not silently assigned as new repairs. Resource assumptions and locally entered assessments/deadlines are labelled. (3) Add shared navigation, list/search/status filters, detailed evidence/planning editor, resource editor and proposed schedule with local review/acceptance. Inputs and accepted schedules persist with validation; changing inputs invalidates acceptance. (4) Run tests/lint/build, browser-check list/filter/detail/edit/generate/accept, mobile, failure/empty states and review independently. Existing overview remains a labelled illustrative dashboard; real Repairs and Schedule identify their own data source.

Files: `src/lib/dashboard/repairs.ts`, `scheduler.ts`, corresponding tests; `src/app/api/dashboard/issues/route.ts`; route-local `WorkspaceNav.tsx`, `RepairsWorkspace.tsx`, `RepairsList.tsx`, `IssueDetail.tsx`, `ScheduleView.tsx`, scoped CSS and two pages. No new dependencies. No live dispatch or database writes. Approved inline execution; reuse existing checkout.


### Final extension verification

- Real public register: statuses, search, priority, complete public evidence/location/date fields and source links. Pages advance by actual returned offsets, respecting server row caps. No seeded reports are substituted on failure.
- Latest team changes introduced `/api/reports/[id]/assessment`; this feature uses the same FMS-linked public publication scope for structured AI risk bands and work-order proposals. AI data is explicitly labelled provisional. U stays unassessed even when a numeric model rating is high. Other live private assessments, resident descriptions, private photos and signed URLs are excluded.
- Related work-order commitments are checked across all matching assessment records. Both lookups paginate with exact counts; missing configuration, lookup errors or incomplete/changing snapshots produce unknown commitments and block routine scheduling. Existing booked/started/done work cannot silently acquire a second visit through a FMS alias.
- Source checks: 343 public reports with original dates, descriptions and addresses; 153 stored AI proposals/work orders available at verification (counts change as backfill continues). Fixed a rejected server credential using the existing key for the matching authenticated Supabase project, and updated the Vercel production environment. No keys were rotated, permissions changed, or secret values printed/committed.
- Scheduler: editable illustrative crews, qualified staffing, working windows, lunch, travel allowances, equipment concurrency, material consumption and cash limits. Unassessed scope gets inspection; physical repair needs reviewed scope and assessed priority. Public work orders require live/distinct-work provenance review. Proposed emergencies are directed to immediate safety review outside the routine plan.
- Policy targets need an action, London date/time and HTTPS source. They remain locally entered planning targets, not verified statutory deadlines. At-risk counts include both late assignments and unscheduled targets, and show target coverage.
- Browser checks: status filters, search, public photo/description/date/location, local priority edits/removal, proposed schedule, acceptance/reload and input-change invalidation. One versus two inspection crews produced 35 versus 70 visits in the original synthetic resource experiment; these are scenario calculations, not observed council performance. Desktop1536×1024 and mobile390×844 checked without page overflow; no browser app errors. Built-in browser calls failed before dispatch, so installed agent-browser CLI was used.
- Independent reviews covered resource constraints, privacy, alias bookings, pagination and unknown-commitment failure handling. 48 tests pass across the new feature and existing dashboard/council/map/Street Brain suites; lint/type-check and production build pass. Screenshots live under /tmp outside the repository.
- Existing overview remains explicitly illustrative. The main-home link from concurrent team changes was preserved while integrating real Repairs and Schedule navigation.
