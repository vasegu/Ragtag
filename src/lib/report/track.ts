import { CATEGORY_META, type Category, type Classification, type Report } from "./types";

// Per-report tracker in the shape of Santiago's severity and allocation models
// (harvest/docs/severity-assessment-model.md, resource-allocation-model.md):
// provisional S0-S4 severity, issue family, owner kept separate from handoff status,
// a plan of actions, and dates only labelled "confirmed" when the service set them.
// The ranking below is a stand-in for his allocation model and follows its planner
// order: severity first, then deadline slack, then waiting time.

export type StageKey = "reported" | "classified" | "planned" | "dispatched" | "completed";
export type StageState = "done" | "current" | "upcoming";
export type Stage = { key: StageKey; title: string; state: StageState; at?: string; lines: string[] };

export type Severity = "S0" | "S1" | "S2" | "S3" | "S4";

export type Track = {
  stages: Stage[];
  /** Big line at the top, e.g. "Crew expected 3–5 Nov". */
  headline: { title: string; value: string; confirmed: boolean };
  severity: Severity;
  family: string;
  owner: { name: string; kind: "hackney" | "other" | "unassigned"; handoff: "sent" | "not_sent" };
  actions: string[];
  target: string;
  queue: { category: { position: number; total: number }; overall: { position: number; total: number } } | null;
  eta: { from: string; to: string } | null;
  duplicates: number;
  councilMessage: { body: string; at: string } | null;
};

const FAMILY: Record<Category, string> = {
  pothole: "carriageway_pothole",
  pavement: "footway_defect",
  flytip: "waste_or_graffiti",
  litter: "waste_or_graffiti",
  graffiti: "waste_or_graffiti",
  parking: "abandoned_vehicle",
  streetlight: "street_lighting",
};

const FAMILY_LABEL: Record<string, string> = {
  carriageway_pothole: "Road defect",
  footway_defect: "Pavement defect",
  waste_or_graffiti: "Waste or graffiti",
  abandoned_vehicle: "Parking or vehicle",
  street_lighting: "Street lighting",
};

/** Santiago's model: create action tasks, not one ranked case. */
const ACTIONS: Record<string, string[]> = {
  carriageway_pothole: ["Inspector visits and measures", "Make safe if dangerous", "Permanent repair"],
  footway_defect: ["Inspect the trip hazard", "Make safe", "Repair the surface"],
  waste_or_graffiti: ["Check for sharps or hazardous waste", "Crew clears it", "Look for evidence to fine whoever dumped it"],
  abandoned_vehicle: ["Enforcement officer visits", "Penalty notice or removal if needed"],
  street_lighting: ["Fault check", "Repair or replace the lamp"],
};

/** Hours used to measure deadline slack. Where Hackney's target depends on an inspector's
 *  category (roads, pavements) this is only a planning assumption, not a promise. */
const TARGET_HOURS: Record<Category, number> = { flytip: 24, litter: 24, parking: 24, graffiti: 168, streetlight: 168, pothole: 672, pavement: 672 };

/** Modelled jobs a day per category across crews. Hackney doesn't publish these. */
const JOBS_PER_DAY: Record<Category, number> = { flytip: 18, litter: 22, parking: 25, graffiti: 6, streetlight: 4, pothole: 6, pavement: 5 };

const SEVERITY_RANK: Record<Severity, number> = { S0: 0, S1: 1, S2: 2, S3: 3, S4: 4 };

/** Provisional severity. From the classifier's 1-5 when we have it; otherwise a family default. */
export function severityOf(report: Report, classification?: Partial<Classification> | null): Severity {
  if (classification?.severity) {
    const s = classification.severity;
    if (s >= 5 && (classification.safety ?? 0) > 0.8) return "S1";
    return s >= 4 ? "S2" : s >= 3 ? "S3" : "S4";
  }
  if (/needles|drug|sharps/i.test(report.fms?.rawCategory ?? "")) return "S2";
  return report.category === "pothole" || report.category === "pavement" ? "S3" : report.category === "flytip" ? "S3" : "S4";
}

function ownerOf(report: Report) {
  const meta = CATEGORY_META[report.category];
  const council = report.fms?.council;
  const notOurs = /not responsible|not the council/i.test(report.fms?.state ?? report.fms?.councilUpdate?.stateChange ?? "");
  const handoff: "sent" | "not_sent" = report.fms?.firstResponseAt ? "sent" : "not_sent";
  if (notOurs) return { name: "Not Hackney's: referred on", kind: "unassigned" as const, handoff };
  if (council && !/hackney/i.test(council)) return { name: council, kind: "other" as const, handoff };
  return { name: meta.owner, kind: "hackney" as const, handoff: report.source === "app" ? ("sent" as const) : handoff };
}

const hoursSince = (iso: string, now: number) => (now - new Date(iso).getTime()) / 3_600_000;

function metres(a: Report, b: Report) {
  const dy = (b.lat - a.lat) * 111_320;
  const dx = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Open reports in planner order. Stand-in for Santiago's allocation model. */
function plannerOrder(open: Report[], now: number, severities: Map<string, Severity>) {
  return [...open].sort((a, b) => {
    const s = SEVERITY_RANK[severities.get(a.id)!] - SEVERITY_RANK[severities.get(b.id)!];
    if (s) return s;
    const slackA = TARGET_HOURS[a.category] - hoursSince(a.created_at, now);
    const slackB = TARGET_HOURS[b.category] - hoursSince(b.created_at, now);
    if (Math.abs(slackA - slackB) > 1) return slackA - slackB;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

function addWorkingDays(from: Date, days: number) {
  const d = new Date(from);
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const range = (from: string, to: string) => (from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`);

export function buildTrack(report: Report, all: Report[], opts: { classification?: Partial<Classification> | null; now?: number } = {}): Track {
  const now = opts.now ?? Date.now();
  const meta = CATEGORY_META[report.category];
  const family = FAMILY[report.category];
  const severity = severityOf(report, opts.classification);
  const owner = ownerOf(report);
  const actions = ACTIONS[family];
  const fixed = report.status === "fixed";
  const fms = report.fms;

  // Duplicate candidates: same category within 40m. Shown, but they don't raise severity.
  const duplicates = all.filter((r) => r.id !== report.id && r.category === report.category && metres(report, r) < 40).length + report.confirmations;

  // Queue: only for open work Hackney owns.
  const open = all.filter((r) => r.status !== "fixed" && ownerOf(r).kind === "hackney");
  if (!fixed && owner.kind === "hackney" && !open.some((r) => r.id === report.id)) open.push(report);
  const severities = new Map(open.map((r) => [r.id, r.id === report.id ? severity : severityOf(r)]));
  let queue: Track["queue"] = null;
  let eta: Track["eta"] = null;
  if (!fixed && owner.kind === "hackney") {
    const ordered = plannerOrder(open, now, severities);
    const sameCat = ordered.filter((r) => r.category === report.category);
    const catPos = sameCat.findIndex((r) => r.id === report.id) + 1;
    queue = {
      category: { position: catPos, total: sameCat.length },
      overall: { position: ordered.findIndex((r) => r.id === report.id) + 1, total: ordered.length },
    };
    const days = catPos / JOBS_PER_DAY[report.category];
    eta = { from: addWorkingDays(new Date(now), days), to: addWorkingDays(new Date(now), days * 1.6 + 1) };
  }

  const dispatchedAt = fms?.firstActionAt ?? null;
  const dispatched = Boolean(dispatchedAt) || report.status === "scheduled";
  const planned = owner.kind !== "hackney" || owner.handoff === "sent" || report.source === "app";
  const councilMessage = fms?.councilUpdate?.body ? { body: fms.councilUpdate.body, at: fms.councilUpdate.at } : null;

  const stages: Stage[] = [
    {
      key: "reported",
      title: duplicates ? `Reported, and ${duplicates} more nearby` : "Reported",
      state: "done",
      at: report.created_at,
      lines: duplicates
        ? [`${duplicates} nearby ${duplicates === 1 ? "report looks" : "reports look"} like the same problem. Grouped, without inflating severity.`]
        : ["Photo and location received."],
    },
    {
      key: "classified",
      title: "Classified by AI",
      state: "done",
      at: report.created_at,
      lines: [
        `${meta.label} · ${FAMILY_LABEL[family]} · ${severity} provisional`,
        owner.kind === "hackney" ? `Assigned to ${owner.name}` : owner.kind === "other" ? `Owned by ${owner.name}. Referred to them.` : owner.name,
      ],
    },
    {
      key: "planned",
      title: owner.kind === "hackney" ? "Plan made" : `With ${owner.kind === "other" ? owner.name : "another body"}`,
      state: fixed || dispatched ? "done" : planned ? "current" : "current",
      at: fms?.firstResponseAt ?? (report.source === "app" ? report.created_at : undefined),
      lines:
        owner.kind === "hackney"
          ? [
              actions.join(" → "),
              ...(queue
                ? [`#${queue.category.position} of ${queue.category.total} ${meta.label.toLowerCase()} jobs · #${queue.overall.position} of ${queue.overall.total} overall`]
                : []),
              `Published target: ${meta.deadline}`,
            ]
          : ["Hackney has passed this on. Track it with them."],
    },
    {
      key: "dispatched",
      title: dispatched ? "Crew dispatched" : "Crew dispatched",
      state: fixed ? "done" : dispatched ? "current" : "upcoming",
      at: dispatchedAt ?? undefined,
      lines: dispatchedAt
        ? [`Day of work: ${shortDate(dispatchedAt)}`]
        : dispatched
          ? ["Action scheduled by Hackney."]
          : eta
            ? [`Estimated ${range(eta.from, eta.to)} (our estimate, not a Hackney date)`]
            : [],
    },
    {
      key: "completed",
      title: "Completed",
      state: fixed ? "done" : "upcoming",
      at: fixed ? (fms?.resolvedAt ?? undefined) : undefined,
      lines: fixed ? [`Marked fixed by ${owner.kind === "hackney" ? meta.owner : owner.name}.`] : [],
    },
  ];

  const headline: Track["headline"] = fixed
    ? { title: "Fixed", value: fms?.resolvedAt ? shortDate(fms.resolvedAt) : "Done", confirmed: true }
    : dispatchedAt
      ? { title: "Day of work", value: shortDate(dispatchedAt), confirmed: true }
      : owner.kind !== "hackney"
        ? { title: "Status", value: owner.kind === "other" ? `With ${owner.name}` : "Referred on", confirmed: true }
        : eta
          ? { title: "Crew expected", value: range(eta.from, eta.to), confirmed: false }
          : { title: "Status", value: "Planning", confirmed: false };

  return { stages, headline, severity, family, owner, actions, target: meta.deadline, queue, eta, duplicates, councilMessage };
}
