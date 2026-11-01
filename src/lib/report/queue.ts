import type { Category, Classification, QueueInfo, Report } from "./types";
import { CATEGORY_META } from "./types";

// Mock ranking until Santiago's QUEUE_URL is live. Same output contract (QueueInfo).

const DEADLINE_DAYS: Record<Category, number> = { pothole: 28, flytip: 1, litter: 1, parking: 1, streetlight: 7, graffiti: 7, pavement: 28 };
/** Modelled capacity: jobs cleared per working day across all crews. Hackney doesn't publish this. */
const JOBS_PER_DAY = 14;

type Scored = { id: string; score: number };

function scoreOf(r: Pick<Report, "category" | "created_at" | "confirmations">, c?: Partial<Classification>, now = Date.now()) {
  const severity = c?.severity ?? 3;
  const safety = c?.safety ?? 0.4;
  const exposure = c?.exposure ?? 0.4;
  const ageDays = (now - new Date(r.created_at).getTime()) / 86_400_000;
  const overdue = Math.max(0, ageDays / DEADLINE_DAYS[r.category]);
  return severity * 8 + safety * 20 + exposure * 15 + Math.min(overdue, 3) * 10 + r.confirmations * 5;
}

function addWorkingDays(from: Date, days: number) {
  const d = new Date(from);
  let left = Math.max(1, Math.round(days));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/** Rank a new report against everything open and estimate its fix window. */
export function queueFor(
  report: Pick<Report, "id" | "category" | "created_at" | "confirmations">,
  classification: Partial<Classification> | undefined,
  open: Report[],
  now = Date.now(),
): QueueInfo {
  const mine = scoreOf(report, classification, now);
  // Seeded reports have no classification; give them a mid severity with some spread from their id.
  const others: Scored[] = open
    .filter((r) => r.id !== report.id && r.status !== "fixed")
    .map((r) => {
      const spread = (parseInt(r.id.replace(/\D/g, "") || "0", 10) % 5) + 1;
      return { id: r.id, score: scoreOf(r, { severity: spread, safety: spread / 7, exposure: 0.4 }, now) };
    });
  const ahead = others.filter((o) => o.score > mine).length;
  const position = ahead + 1;
  const total = others.length + 1;
  const days = position / JOBS_PER_DAY;
  const today = new Date(now);

  const severity = classification?.severity ?? 3;
  const breakdown = [
    { label: `Severity ${severity}/5`, points: Math.round(severity * 8) },
    { label: "Risk to people", points: Math.round((classification?.safety ?? 0.4) * 20) },
    { label: "Footfall and traffic", points: Math.round((classification?.exposure ?? 0.4) * 15) },
  ];
  if (report.confirmations) breakdown.push({ label: `${report.confirmations} neighbours confirmed`, points: report.confirmations * 5 });

  return {
    position,
    total_open: total,
    eta_from: addWorkingDays(today, days + 1),
    eta_to: addWorkingDays(today, days * 1.5 + 4),
    score: Math.round(mine),
    breakdown,
    boosts: [
      { label: "2 neighbours confirm it's still there", points: 10 },
      { label: "Add a second photo from another angle", points: 4 },
      { label: `Automatic if it passes its deadline (${CATEGORY_META[report.category].deadline})`, points: 10 },
    ],
    owner: CATEGORY_META[report.category].owner,
    stage: "routed",
  };
}
