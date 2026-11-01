# Hackney issue severity model

Version 0.3.0 · 1 November 2026 · **Proposed, uncalibrated decision support**

Companion: [ranking-config.yaml](ranking-config.yaml). Source inventory:
[hackney-severity-policy-links.txt](hackney-severity-policy-links.txt).
Based on the supplied v0.1 files; those originals are preserved.

## What the model decides

For each reported issue, return four separate things:

1. **Hazard severity:** emergency, high, elevated, routine, assessed no actionable
   hazard, or unassessed. The same hazard remains dangerous whoever owns it.
2. **Response requirements:** applicable inspection, make-safe and repair targets,
   their source, applicability and clock status. A target is not a severity score.
3. **Responsibility:** who should inspect, make safe and repair; these can differ.
4. **Allocation inputs:** residual risk, urgent actions, confirmed deadlines and
   dependencies for the planner. Cost and crew availability do not change severity.

This is a specification and declarative configuration, not a trained statistical
model, executable classifier, council-approved policy or deployed service.
An LLM may extract candidate facts and explain decisions; deterministic rules and
qualified assessors decide the resulting classification. No tools submit reports
or instruct crews merely because the configuration contains an action name.

## Approach and evidence

A policy-only model leaves gaps outside measured highways defects. A single
weighted score obscures emergencies and legal obligations. This version uses
**emergency rules, a common risk matrix, and separate service-specific policy
profiles**. This is the author's proposed approach, not a council decision.

The UKRLG code supports risk-based assessment and local judgement; it does not
prescribe this model's 1–5 scales, cutoffs or cross-service comparisons. Those are
all proposed. The Highways Act maintenance duty and reasonable-care defence do
not establish a universal pothole depth or guarantee a liability defence.
[UKRLG code, A.5](https://content.tfl.gov.uk/well-managed-highway-infrastructure.pdf),
[Highways Act s41](https://www.legislation.gov.uk/ukpga/1980/66/section/41),
[s58](https://www.legislation.gov.uk/ukpga/1980/66/section/58).

## 1. Inputs and evidence quality

### Start with the available report record

The initial input is the existing record below. No new field is required to
accept a report; enrichment is a separate assessment attached to its ID.

| Available fields | Use now | Do not assume |
|---|---|---|
| `id` | Stable link to the original record and assessment revisions | Unique across different source systems without a source namespace |
| `title`, `detail` | Extract issue family, hazard claims, dimensions explicitly given, affected people, location context and temporal language | Description completeness, current truth or measured dimensions |
| `category` | Hint for family classification and follow-up selection | Severity, ownership, or that a mixed report contains only this hazard |
| `status`, `is_fixed` | Source workflow state; select closure-verification or unresolved-case review | A verified repair, absence of danger, or legal compliance |
| `postcode`, `address` | Reported location, disambiguation and later contextual lookups | Asset ownership, deprivation, vulnerability or actual footfall |
| `lat`, `lon` | Reported point for mapping, duplicate candidates and optional spatial joins | Precise asset location, road surface, adoption or responsible body |
| `created_at` | Source record creation and waiting-time proxy, if its meaning is known | Defect onset, inspection, council/landlord awareness or legal clock start |
| `last_update` | Source-record freshness and reassessment scheduling | Last inspection, repair time or deterioration |
| `raw` | Preserve original payload; extract only documented, allowlisted source paths | A fixed shape, trusted instructions, verified officer evidence or available photographs |

Store ID as a string, preserving leading zeroes. A source namespace is ingestion
metadata, not an extra question for residents. Invalid/missing IDs go to data
quality review with an ingestion reference. Parse booleans explicitly (`"false"`
is not true), validate latitude/longitude and parse timestamp offsets. Coordinates
must fall in valid global ranges; a Hackney boundary check flags routing review
instead of discarding a safety report. Conflicting location fields remain visible.
An offset-free timestamp needs a documented source timezone; do not silently
assume UTC. Impossible dates or `last_update < created_at` are quality flags.

### What the first pass can produce

1. Preserve the record, normalise types and record ingestion/source metadata.
2. Read `title` and `detail` together. Extract each claim with the originating
   field and exact text span, including negation, uncertainty and time context.
   All these facts start as **reported**, including a resident-stated measurement.
3. Treat `category` as a hint. “Pothole” alone supplies no depth or L/C values.
   “Dangerous” alone does not establish an imminent serious-harm mechanism.
   “Open drain in the pavement, people walking around it” supports an emergency
   signal; “the cover was missing but was replaced yesterday” is historical,
   and does not independently establish a present emergency.
4. Extract credible current or temporally unresolved serious-danger reports for
   immediate human safety review; retain age/freshness uncertainty. A historical
   threat alone is not an active emergency, and a claimed repair is not verified.
   Contradictory current danger and fixed status must be escalated, not filtered out.
5. Score only supported L/C intervals. Otherwise return U, the reason, specific
   missing evidence and next action. Category-only priors must not masquerade as
   observed risk. A precautionary S1 bound on an unknown report is **not** an
   assessed high-severity finding and must not be counted as such in dashboards.

The model therefore supports immediate **report-based triage** with this schema;
it cannot reliably assign every report a numerical risk or a repair category.
Family, safety signals, evidence completeness, source workflow state and missing
questions remain useful outputs when the answer is U. If urgent assessment tasks
exceed capacity, flag the backlog for human triage; do not turn uncertainty into
low severity merely to obtain a complete ranking.

### Progressive enrichment through reporting

Ask up to three relevant questions per round, safety first; allow “don't know”.
An emergency alert never waits for the answers. Ask only what can change the
decision and is safe to describe from the resident's existing position:

| Family | First useful questions |
|---|---|
| All | Is anyone in immediate danger now? Is this still happening? Where exactly is the affected asset? |
| Pothole/footway/cover | Is it in the road, cycle lane or pavement? Is a cover missing or the surface collapsing? Is there a safe way around it? |
| Lighting | Is it just not lighting up, or are there exposed wires, sparks or a leaning column? Is a crossing/path affected? |
| Flooding | Is water rising or entering an occupied building? Is anyone trapped? Are electricity or sewage involved? |
| Tree/structure | Is anything falling, moving or at risk of collapsing now? Can people reach the area? |
| Waste/vehicle | Are there visible sharps, chemicals, fire or leaks? Is passage blocked? |
| Housing | Are occupants unsafe now? Are electrics/structure affected? What is the tenure and is there a relevant health impact the resident wishes to disclose? |

Collect photos/voice notes only when available; do not assume `raw` supplies
them. Depth, width, inspection findings, effective barriers and owner confirmation
can be added later by competent staff. Optional GIS joins need dataset/version,
spatial uncertainty and join method; proximity to a school remains context, not
proof of exposure. No external lookup or paid service is required for initial triage.
If the source report has no reply channel, create an inspection/review task rather
than inventing contact details. Restrict sensitive health/contact data to staff
who need it and keep it out of public explanations.

Persist enrichment separately: `report_id`, source namespace, source revision,
assessment time/model version, extracted facts, safety signals, L/C intervals,
severity, missing fields, follow-up questions, policy candidates and review actions.
Do not overwrite upstream `category`, `status`, `is_fixed` or `raw` with inferences.
An update creates an assessment revision. A routine metadata edit alone is not
evidence of a worsened hazard.

Every fact has `value`, `evidence_id`, `observed_at`, `method` and `status`:
`reported`, `estimated` or `verified`. Missing means `null`, not false or zero.
Separate extracted language from the resident's original text/photo/voice note.

Collect:

- Issue family and individual hazards; location and location uncertainty.
- People currently exposed; injuries, near misses, entrapment, fire, electricity,
  collapse, open voids, contaminated water and blocked escape/access routes.
- Dimensions as intervals, measurement method, stability, deterioration and
  weather. A photo without reliable scale cannot establish millimetres.
- Road/footway/cycleway position, crossing, traffic/footfall, actual accessibility,
  affected services, occupancy and relevant vulnerability where volunteered.
- Owner/maintainer evidence, highway adoption or housing tenure where relevant.
- First received, responsible-body awareness, inspection, confirmation and
  action timestamps; barriers/closures and whether their effectiveness is verified.

Do not ask residents to enter a road, touch a cover, approach live equipment,
walk through floodwater or inspect a dangerous tree to improve confidence.
Never infer disability, ethnicity or health from appearance or postcode.

## 2. Safety screening comes before routing or deduplication

Any credible report of an immediately accessible open void, exposed electrical
danger, active collapse/falling objects, people trapped by flooding, fire, or
another imminent serious threat produces **S0: Emergency — provisional** and an
immediate human alert. Confirmation is not a prerequisite for the alert.
The exact trigger-to-S0 mapping is a proposed precautionary rule; it is not a
claim that every trigger has a statutory two-hour repair deadline.

Recommend emergency-service contact where life is threatened; route the asset
hazard to the appropriate duty service as well. Electrical, structural and flood
issues require different competent responders. Record who was alerted and
whether they accepted the handoff; a suggested referral is not a completed action.
Hackney distinguishes imminent structural danger and gives emergency flood
advice. [Structures](https://www.hackney.gov.uk/planning-and-building/building-control/dangerous-structures-and-public-safety),
[flooding](https://www.hackney.gov.uk/community-safety-and-environment/community-safety-and-crime-prevention/emergency-planning-and-response/flood-warnings-and-planning).

Unknown answers to safety questions create an urgent assessment task, not a
negative safety screen. A verified effective closure can reduce **residual** risk
after human review; it does not delete original severity or the remaining repair.

## 3. Score each non-emergency hazard

Use the next **seven calendar days under current conditions** as the common
triage horizon. This horizon is proposed and does not replace policy clocks,
longer-term housing assessments or asset lifecycle planning. Reassess after
material change, new evidence or an assessor-set review date.

**R = L × C**, an ordinal index from 1 to 25, not a probability or expected loss.

| Value | L: likelihood of a harmful encounter/outcome in the horizon |
|---|---|
| 1 | Rare: exposure is genuinely exceptional; evidence supports effective avoidance |
| 2 | Unlikely: occasional exposure with a usable safe alternative |
| 3 | Possible: credible ordinary exposure; harm is plausible |
| 4 | Likely: frequent exposure or repeated evidenced near misses |
| 5 | Almost certain: harmful encounters recurring or expected imminently |

An imminent serious threat still goes through the emergency rule, even at low L.
Assess L from the defect mechanism, location, users and controls together.
Hierarchy, school proximity, darkness and cycle position are evidence prompts,
not independent +1 bonuses. Count actual exposure once. A school 100 metres
away is not sufficient evidence that the affected route serves its pupils.

| Value | C: worst credible consequence for an exposed person/service |
|---|---|
| 1 | Inconvenience, amenity loss or cosmetic harm; no credible injury mechanism |
| 2 | Minor reversible injury or limited disruption with a usable alternative |
| 3 | Injury requiring medical attention, sustained loss of essential access, or material local property/service harm |
| 4 | Life-changing injury, major displacement, or serious disruption to critical services |
| 5 | Credible fatality or multiple severe casualties |

Use evidenced vulnerability when it changes the consequence or likelihood for
the people actually exposed. Explain that effect rather than adding a generic
vulnerability multiplier. C is the highest credible consequence dimension, not
the sum of injury, property and service scores. A clinician/competent housing
assessor must handle specialist health assessment; this matrix is not HHSRS.

| Level | Proposed rule | Meaning and suggested next step |
|---|---|---|
| S0 Emergency | Any emergency rule | Immediate human safety response; no ordinary queue |
| S1 High | R >= 15 **or C = 5** | Urgent competent assessment and protective-action decision |
| S2 Elevated | R = 6–14, unless S1 applies | Prioritised inspection/remediation |
| S3 Routine | R = 1–5, unless S1 applies | Ordinary inspection/maintenance workflow |
| S4 Assessed no actionable hazard | Competent assessment explicitly records no actionable hazard | Monitor or close with reason and review trigger |
| U Unassessed | L or C cannot be supported | Obtain missing evidence/competent assessment; no automatic closure |

No new SLA is implied by “urgent”, “prioritised” or “routine”. Only the policy
profile can supply a sourced target. R=1 does not automatically produce S4.

### Uncertainty

Store L and C as inclusive integer intervals. Calculate `risk_min = Lmin*Cmin`
and `risk_max = Lmax*Cmax`; evaluate level at each endpoint, including the C=5
floor. If all admissible combinations have one level, return that level marked
provisional. Otherwise return U with the possible levels and the most urgent
plausible non-emergency level as `precautionary_level`; send it to human review.
With no evidence at all, each interval is [1,5], not [1,1]. Missing or contradictory
safety information separately requires urgent assessment. Confidence never
multiplies risk downwards. Preserve conflicting evidence until an assessor resolves it.

For several hazards on one case, take the most urgent hazard level. If any hazard
is U, the case remains `assessment_incomplete`, with its precautionary level
retained alongside known hazards. Do not sum unrelated ordinal scores.

## 4. Apply policy profiles independently

### Carriageway potholes

The council-linked transparency report B3.1 publishes the following targets.
These are local criteria, not statutory national thresholds:

| Candidate | Published threshold | Make safe | Permanent repair |
|---|---|---|---|
| Emergency call-out | >=50mm plus immediate hazard/risk/location | 2 hours | 28 days |
| A | >=50mm with contextual assessment | 24 hours | 24 hours **or** 28 days, context-dependent |
| B | >=40mm with risk/location | Not specified | 7 days |
| C | >=20mm with risk/location | Not specified | 28 days |

Source: [Hackney transparency report, B3.1](https://docs.google.com/document/d/1koXHulZSzkO6hLl8Z0SEnbs0ElL5dnEElSYwIeRZ_fc/edit).
Depth alone generates candidates: [20,40) → C; [40,50) → B; >=50 → A or
Emergency, selected by an inspector. Overlapping depth intervals return every
possible candidate plus review. Below 20mm means no depth-based match, not safe.
An unknown dimension or a void is never manufactured into a precise measurement.

The recommendation retains the faster applicable **confirmed** policy action
even when the risk matrix is lower. Conversely, an emergency safety signal is
escalated even if a dimensional criterion is unmet. A low matrix score cannot
stretch a seven-day repair target to 28 or 56 days. The ordinary model does not
choose the A-category permanent-repair branch or silently assume its longest time.
If unresolved, show both branches and escalate; do not emit one definitive due date.

The linked older highways policy uses numeric categories and has different
purposes, including duplicates and referrals. Its intervention criteria are
not automatic assignments to a response category. Preserve it as supporting
evidence but require policy reconciliation; never label a referral as severity.
[Older policy, sections 5.4 and 6](https://drive.google.com/file/d/1agcSsWctPnbX5cwMh3Io1IOA-HEdZk1i/view).

### Other families

| Family | How severity is assessed | Policy treatment |
|---|---|---|
| Footway trips/slabs/covers | Falls, accessibility, stability and exposed users | Older 20mm criteria are review flags; do not apply carriageway A–C times automatically |
| Lighting | Electrical/column danger first; then darkness, crossing visibility and users | Old five-working-day lamp-fault target retained as unconfirmed reference only |
| Flooding/drainage | People, flow, contamination, electricity, access and escalation | Distinguish highway gully, water main, sewer, river and private drainage; no invented universal repair time |
| Trees | Failure evidence, falling branches, exposure and obstruction | Competent arboricultural assessment; ownership and permissions are separate |
| Waste/graffiti | Sharps, toxic/flammable material, access and intimidation as well as amenity | Apply exact current service/cleansing profile where supported; cleanliness grade is separate from S0–S4 |
| Dangerous structures | Collapse/falling-material danger and public exposure | Immediate vs non-immediate danger; no fabricated fixed emergency hour target |
| Abandoned vehicles | Fire, instability, leakage, obstruction and exposure | Abandonment indicators and removal process separate from hazard severity |
| Housing damp/mould/leaks | Health, vulnerability, electricity, habitability and structural effects | Tenure-specific housing assessment and Awaab profile; do not derive legal hazard status from R |
| Other/unknown | Safety screen, then supported L/C or U | No default SLA or automatic closure |

The [old lighting policy](https://drive.google.com/file/d/1Hw0VNLRQTBiM-5R8dH-d0nkaCnwlb7n5/view)
is visibly dated. General [FixMyStreet response times](https://www.hackney.gov.uk/community-safety-and-environment/pollution-noise-and-environmental-problems/report-problem/response-times-if-youve-reported-problem)
must not be interpreted as guaranteed permanent-repair deadlines.

For applicable social tenancies, Phase 1 Awaab guidance describes emergency
investigation and safety work within 24 hours of landlord awareness; significant
damp/mould investigation within 10 working days, summary within 3 working days
after investigation and safety work within 5 working days after investigation.
Store these as separate obligations, requiring confirmed scope and legal hazard
assessment. A council page referring to inspection must not postpone the emergency
awareness clock. Phase 2 is future-effective on 1 November 2026, starting on
30 November. [National guidance](https://www.gov.uk/government/publications/awaabs-law-guidance-for-social-landlords/awaabs-law-guidance-for-social-landlords-timeframes-for-repairs-in-the-social-rented-sector),
[phase dates](https://www.gov.uk/government/collections/awaabs-law-in-the-social-rented-sector),
[Hackney housing page](https://www.hackney.gov.uk/housing/repairs/damp-mould-and-condensation).

### Clock handling

Each action carries source, authority type, applicability, duration/unit, start
event, status and optional `due_at`. Highway start events/day conventions remain
unconfirmed, so published durations are displayed without fabricated due dates.
Working-day calculations require the England bank-holiday calendar and council
counting conventions. Record the earliest credible awareness; merging duplicates,
rerouting or reopening an unresolved case never resets a running obligation.
Unknown clocks and policy conflicts trigger review rather than imply compliance.

## 5. Route and consolidate without losing risk

Keep owner and responding authority separate. Do not equate “park” or “estate”
with private ownership. Confirm the relevant asset on a red route rather than
assuming everything nearby belongs to TfL. A utility referral may coexist with
a council safety assessment or protective action.

Nearby reports are duplicate **candidates**, not duplicates based on a ten-metre
radius alone. Check asset, hazard and time, retaining all reports and new danger
evidence. Do not automatically add severity for three reports: volume reflects
reporting propensity. Independently evidenced deterioration or injury changes
the hazard inputs and triggers reassessment. Root-cause grouping stays a
hypothesis until substantiated; distinct hazards and deadlines remain visible.

## 6. Hand off to resource allocation

Create action tasks, not just one ranked case: inspect, isolate/make safe, repair,
refer or monitor. Tasks inherit hazard IDs, severity and policy evidence. Track
original risk and verified residual risk separately.

Proposed planner order:

1. Immediate safety actions go to the duty team now, outside ordinary batching.
2. Flag overdue/at-risk confirmed obligations; schedule hard applicable duties
   and approved commitments subject to safe delivery. Escalate infeasibility.
3. Prioritise residual severity, deadline slack and evidenced deterioration.
4. Within comparable urgency, consider waiting time, safe bundling and efficiency.

Unknown ownership does not remove an inspection task. Unknown clock origin does
not place a case behind all dated tasks: it creates a clock-resolution task.
Bundling never delays an emergency or a confirmed deadline. Budget shortages
produce an escalation and recorded unmet work, not a lower severity score.

Do not optimise a sum of ordinal R values as if they were calibrated expected
injuries. A future solver needs validated risk-reduction estimates, duration,
costs, competence, resources and dependencies. Audit under-reporting and coverage
across wards; any equity coefficient is a proposed allocation choice, not a legal
coefficient supplied by [Equality Act s149](https://www.legislation.gov.uk/ukpga/2010/15/section/149).

## 7. Output contract

```yaml
case_id: example-60mm
model_version: 0.3.0
assessment_status: provisional
issue_family: carriageway_pothole
severity:
  level: S2
  likelihood: {min: 3, max: 3}
  consequence: {min: 3, max: 3}
  risk: {min: 9, max: 9}
  basis: proposed_matrix
policy:
  profile: highway_transparency_b3_1
  candidate_categories: [A, Emergency]
  confirmed_category: null
  clocks: []  # instantiate after scope/category review; no invented due date
routing: {owner: unknown, handoff_status: not_sent}
review_reasons: [inspector_category_selection, highway_clock_unconfirmed]
actions: [competent_inspection, resolve_owner_and_policy]
```

Also persist hazard evidence, safety-screen answers, rule IDs, source versions,
input changes, effective controls, human decisions and reasons. Display a short
explanation in the resident's language and distinguish recommendations from
accepted actions. Promise a date only when the responsible service has confirmed it.

## 8. Worked decisions and validation

| Scenario | Proposed matrix | Severity | Independent response |
|---|---|---|---|
| 60mm cycle-lane hole; plausible medically serious fall | L3 × C3 = 9 | S2 | A/Emergency candidates; inspector decides, not seven days from matrix |
| 45mm quiet-road hole; minor credible harm | L2 × C2 = 4 | S3 | B candidate, seven-day published repair target once applicable |
| 25mm quiet footway trip | L2 × C2 = 4 | S3 | Footway review; no invented 56-day target |
| Missing utility cover in accessible footway | Emergency rule | S0 | Immediate alert plus utility handoff; retain safety task |
| Same missing cover already reported | Emergency rule | S0 | Merge evidence without dropping alert or resetting clocks |
| 15mm defect with wheel-entrapment risk | L4 × C3 = 12 | S2 | Below depth trigger does not mean monitor automatically |
| Unknown-depth water-covered defect | L[2,4] × C[2,4] = [4,16] | U, precaution S1 | Urgent assessment; no made-up depth |
| Exposed electrical equipment on red route | Emergency rule | S0 | Duty response and verified TfL/utility routing |
| Cosmetic graffiti, safe access | L1 × C1 = 1 | S3 | Relevant cleansing/enforcement workflow, not emergency |
| Rare credible fatal consequence, no imminent signal | L1 × C5 = 5 | S1 floor | Urgent specialist assessment |
| No supporting facts | L[1,5] × C[1,5] | U, precaution S1 | Urgent assessment, never automatic no-action |

The companion YAML contains these fixtures plus threshold and routing edge cases.
They are illustrative consistency checks, not empirical validation. No historical
inspector decisions, harm labels or inter-rater calibration have been supplied.

Before operational use: reconcile current highway policy/clock conventions; have
inspectors independently label real cases across all supported families; measure
emergency false negatives, under-triage, calibration disagreements and abstention;
test missing evidence and ownership handoffs; audit accessibility and under-reporting;
and obtain service-owner approval for each enabled profile. Until then every
classification is provisional and no automatic dispatch/closure is enabled.

### Changes from the supplied v0.1

- Safety assessment survives external ownership, duplicates and unknown ownership.
- Replaced defect-depth × exposure with explicitly proposed likelihood × consequence.
- Removed report-count escalation, guessed photo measurements and automatic safe
  classification below 20mm; introduced uncertainty and multiple hazards.
- Separated measured policy candidates and action clocks from severity; removed
  the unsupported hazardous-cover-to-24-hours policy attribution.
- Removed purported policy origins for arbitrary +1 weights and 100m buffers.
- Expanded triage beyond potholes while keeping service-specific rules separate.
