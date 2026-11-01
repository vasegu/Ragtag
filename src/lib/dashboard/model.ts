// Entirely fictional, fixed-date records: never mixed with harvested council reports.
export const snapshot = "2026-11-01";
export const storageKey = "one-hackney-pm-decisions-v1";
const DAY = 86_400_000;
const end = Date.parse(`${snapshot}T23:59:59.999Z`);
export const areas = ["Highways", "Cleansing", "Lighting"] as const;
export type Area = typeof areas[number];
export type AreaFilter = Area | "all";
export const severities = ["Emergency", "High", "Elevated", "Routine", "Unassessed"] as const;
export type Severity = typeof severities[number];
export const ageLabels = ["0–2 days", "3–7 days", "8–28 days", "29+ days"];
export type Issue = { id: string; title: string; area: Area; severity: Severity; createdAt: string | null; resolvedAt: string | null; overdue: boolean };
export type Decision = { status: "approved" | "changes" | "deferred"; reason: string; at: string };
export type Decisions = Record<string, Decision>;
export type Action = { id: string; issueId: string; title: string; area: Area; severity: Severity; task: string; mode: string; cost: number; due: string; evidence: string; waiting: string; alternative: string };
function dateAgo(days: number) { return new Date(Date.parse(`${snapshot}T12:00:00Z`) - days * DAY).toISOString(); }
const matrix: [Severity, number[]][] = [["High", [3, 4, 3, 2]], ["Elevated", [8, 12, 14, 7]], ["Routine", [15, 17, 18, 7]], ["Unassessed", [6, 5, 4, 3]]];
const titles: Record<Area, string[]> = { Highways: ["Uneven pavement · Dalston Lane", "Road surface damage · Mare Street", "Pothole · Kingsland Road"], Cleansing: ["Fly-tip · Well Street", "Waste removal · London Fields", "Litter · Chatsworth Road"], Lighting: ["Streetlight out · Amhurst Road", "Lighting fault · Graham Road", "Damaged column · Stoke Newington"] };
const open: Issue[] = [];
for (const [severity, counts] of matrix) counts.forEach((count, band) => {
  for (let n = 0; n < count; n++) {
    const index = open.length;
    const area = areas[index % 3];
    const age = [n % 3, 3 + n % 5, 8 + n % 21, 35 + n * 2][band];
    open.push({ id: `OH-${1101 + index}`, title: titles[area][n % 3], area, severity, createdAt: dateAgo(age), resolvedAt: null, overdue: index < 9 });
  }
});
const closed: Issue[] = Array.from({ length: 94 }, (_, i) => {
  const area = areas[i % 3];
  return { id: `OH-${2001 + i}`, title: titles[area][i % 3], area, severity: i < 20 ? "High" : i < 52 ? "Elevated" : "Routine", createdAt: dateAgo(i < 3 ? 5 + i : 45 + i), resolvedAt: dateAgo(i % 30), overdue: false };
});
export const issues = [...open, ...closed];
const high = open.find(i => i.area === "Highways" && i.severity === "High")!;
const elevated = open.find(i => i.area === "Highways" && i.severity === "Elevated")!;
const unknown = open.find(i => i.area === "Cleansing" && i.severity === "Unassessed")!;
high.title = "Damaged surface · Kingsland Road";
elevated.title = "Pavement repair · Mare Street";
unknown.title = "Reported obstruction · London Fields";
export const actions: Action[] = [
  { id: "make-safe-kingsland", issueId: high.id, title: "Kingsland Road", area: "Highways", severity: "High", task: "Make safe", mode: "In-house", cost: 240, due: "2 Nov · 09:00", evidence: "Demo inspection: exposed damaged surface on a busy pedestrian route. Temporary barriers required; permanent repair is a separate action.", waiting: "Without temporary protection, pedestrians remain exposed until the next available slot.", alternative: "Contractor: £500, same proposed morning slot. In-house uses an available qualified crew; £240 is additional cash, excluding committed salaries." },
  { id: "repair-mare", issueId: elevated.id, title: "Mare Street", area: "Highways", severity: "Elevated", task: "Repair", mode: "Contractor", cost: 500, due: "2 Nov · 14:00", evidence: "Demo inspection: localised paving damage. Proposed contractor package includes materials, traffic management and oversight.", waiting: "The in-house repair slot is 1.5 days later. Review the earlier completion against the additional cash cost.", alternative: "In-house: £240 additional cash, £520 resource cost. Contractor: £500 cash and resource cost. Contractor uses £260 more cash; no claimed monetary safety benefit." },
  { id: "inspect-fields", issueId: unknown.id, title: "London Fields", area: "Cleansing", severity: "Unassessed", task: "Inspect", mode: "In-house", cost: 90, due: "2 Nov · 11:00", evidence: "Demo report describes an obstruction but lacks measurements and clear ownership evidence. Severity remains unassessed.", waiting: "Repair planning and ownership confirmation remain blocked until inspection.", alternative: "Use a scheduled inspection visit. The £90 allowance covers incremental travel and inspection supplies. No repair is authorised by this action." },
];
export function ageBand(date: string | null) {
  if (!date) return -1;
  const parsed = Date.parse(date);
  const days = Math.floor((Date.parse(snapshot) - new Date(parsed).setUTCHours(0, 0, 0, 0)) / DAY);
  return !Number.isFinite(days) || days < 0 ? -1 : days <= 2 ? 0 : days <= 7 ? 1 : days <= 28 ? 2 : 3;
}
function inWindow(date: string | null, days: number) { const time = Date.parse(date ?? ""); return time > end - days * DAY && time <= end; }
export function summarise(area: AreaFilter, days: number) {
  const selected = issues.filter(i => area === "all" || i.area === area);
  const fixed = selected.filter(i => inWindow(i.resolvedAt, days));
  const arrivals = selected.filter(i => inWindow(i.createdAt, days)).length;
  const count = days === 7 ? 7 : 4;
  const trend = Array.from({ length: count }, (_, index) => {
    const start = end - days * DAY + days * DAY * index / count;
    const finish = end - days * DAY + days * DAY * (index + 1) / count;
    const within = (date: string | null) => { const t = Date.parse(date ?? ""); return t > start && t <= finish; };
    return { label: days === 7 ? new Date(finish).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }) : `${new Date(start + 1).getUTCDate()} ${new Date(start + 1).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}`, fixed: fixed.filter(i => within(i.resolvedAt)).length, arrivals: selected.filter(i => within(i.createdAt)).length, counts: severities.map(s => fixed.filter(i => i.severity === s && within(i.resolvedAt)).length) };
  });
  return { open: selected.filter(i => !i.resolvedAt), fixed, arrivals, trend };
}
const budgets: Record<Area, [number, number, number]> = { Highways: [40000, 24000, 10000], Cleansing: [25000, 12000, 5000], Lighting: [15000, 6000, 3000] };
export function finance(area: AreaFilter, days: number, decisions: Decisions) {
  const selected = areas.filter(a => area === "all" || a === area);
  const factor = days === 7 ? 0.25 : 1;
  const budget = selected.reduce((n, a) => n + budgets[a][0] * factor, 0);
  const spent = selected.reduce((n, a) => n + budgets[a][1] * factor, 0);
  const reserved = actions.filter(a => selected.includes(a.area) && decisions[a.id]?.status === "approved").reduce((n, a) => n + a.cost, 0);
  const committed = selected.reduce((n, a) => n + budgets[a][2] * factor, 0) + reserved;
  return { budget, spent, committed, available: budget - spent - committed };
}
export function decide(current: Decisions, id: string, status: Decision["status"], reason: string, available = finance("all", 30, current).available): Decisions {
  const action = actions.find(a => a.id === id);
  if (!action) throw new Error("Unknown action");
  if (current[id]) throw new Error("Action already reviewed");
  if (status !== "approved" && !reason.trim()) throw new Error("Add a reason for this decision.");
  if (status === "approved" && action.cost > available) throw new Error("Insufficient available funds.");
  return { ...current, [id]: { status, reason: reason.trim().slice(0, 1000), at: new Date().toISOString() } };
}
export function readDecisions(raw: string | null): Decisions {
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (parsed?.version !== 1 || !parsed.decisions || typeof parsed.decisions !== "object" || Array.isArray(parsed.decisions)) return {};
    const result: Decisions = {};
    for (const action of actions) {
      const d = parsed.decisions[action.id];
      if (d && ["approved", "changes", "deferred"].includes(d.status) && typeof d.reason === "string" && d.reason.length <= 1000 && typeof d.at === "string" && Number.isFinite(Date.parse(d.at)) && (d.status === "approved" || d.reason.trim())) result[action.id] = { status: d.status, reason: d.reason, at: d.at };
    }
    return result;
  } catch { return {}; }
}
export function capacity(area: AreaFilter) {
  const daily: Record<Area, number[][]> = { Highways: [[16, 24], [24, 24], [16, 24], [16, 16], [8, 8]], Cleansing: [[12, 12], [12, 12], [12, 12], [12, 20], [8, 8]], Lighting: [[4, 4], [4, 4], [4, 4], [4, 4], [8, 8]] };
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, i) => areas.filter(a => area === "all" || a === area).reduce((v, a) => ({ day, covered: v.covered + daily[a][i][0], required: v.required + daily[a][i][1] }), { day, covered: 0, required: 0 }));
}
