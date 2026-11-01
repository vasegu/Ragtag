import { z } from "zod";
import { equipmentSchema, planningSchema, planningTime, rankIssues, requirementsSchema, trades, type Planning, type RepairIssue, type Requirement } from "./repairs";

const crewSchema = z.object({ id: z.string().min(1).max(80), name: z.string().trim().min(1).max(100), trade: z.enum(trades), count: z.number().int().min(0).max(8), people: z.number().int().min(1).max(12) });
const unique = (values: { name: string }[]) => new Set(values.map(v => v.name.toLowerCase())).size === values.length;
export const scenarioSchema = z.object({
  crews: z.array(crewSchema).min(1).max(20).refine(v => new Set(v.map(c => c.id)).size === v.length, "Crew IDs must be unique."),
  equipment: equipmentSchema.refine(unique, "Equipment names must be unique."),
  materials: requirementsSchema.refine(unique, "Material names must be unique."),
  start: z.number().int().min(0).max(1439), end: z.number().int().min(1).max(1439),
  buffer: z.number().int().min(0).max(120), budget: z.number().finite().min(0).max(10000000),
  inspectionMinutes: z.number().int().min(15).max(240), inspectionCost: z.number().finite().min(0).max(10000),
}).refine(v => v.end > v.start && v.end - v.start >= 60, "The shift must contain at least one hour.");
export type Scenario = z.infer<typeof scenarioSchema>;
export const defaultScenario: Scenario = {
  crews: [
    { id: "inspect", name: "Inspection team", trade: "inspection", count: 1, people: 2 },
    { id: "highways", name: "Highways gang", trade: "highways", count: 1, people: 3 },
    { id: "waste", name: "Waste team", trade: "waste", count: 2, people: 2 },
    { id: "clean", name: "Cleansing team", trade: "cleansing", count: 1, people: 2 },
    { id: "electrical", name: "Lighting team", trade: "electrical", count: 1, people: 2 },
    { id: "enforcement", name: "Enforcement team", trade: "enforcement", count: 1, people: 2 },
    { id: "arboriculture", name: "Arborist team / contractor", trade: "arboriculture", count: 0, people: 3 },
    { id: "drainage", name: "Drainage team / contractor", trade: "drainage", count: 0, people: 2 },
    { id: "specialist", name: "Specialist contractor", trade: "specialist", count: 0, people: 2 },
  ], equipment: [], materials: [], start: 480, end: 960, buffer: 15, budget: 5000, inspectionMinutes: 30, inspectionCost: 35,
};
export function defaultPlanning(issue: RepairIssue, scenario: Scenario): Planning {
  return { priority: issue.priority, reason: issue.proposal ? `Stored AI proposal, not human-verified: ${issue.proposal.reason}` : "", action: "Inspect", recommendation: "Inspect the reported issue, confirm ownership and establish the repair scope.", trade: "inspection", minutes: scenario.inspectionMinutes, crewSize: 1, cost: scenario.inspectionCost, materials: [], equipment: [], scopeReady: false, dueAt: "", policyUrl: "", deadlineAction: "Inspect" };
}
export type Assignment = {
  issueId: string; title: string; action: Planning["action"]; priority: Planning["priority"];
  date: string; start: number; end: number; crewId: string; crewName: string; people: number;
  cost: number; equipment: Requirement[]; materials: Requirement[]; missesTarget: boolean; dueAt: string;
};
export type Schedule = { assignments: Assignment[]; blockers: { issueId: string; title: string; reason: string; dueAt: string; targetAtRisk: boolean }[]; cost: number; dates: string[]; materialsUsed: Requirement[] };
export const clockTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function londonToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-${parts.find(p => p.type === "day")!.value}`;
}
// Input datetime controls and schedule slots are London wall time, independent of the viewer's timezone.
export const londonTime = planningTime;
const norm = (name: string) => name.trim().toLowerCase();
function sumRequirements(values: Requirement[]) {
  const map = new Map<string, Requirement>();
  for (const r of values) { const key = norm(r.name); map.set(key, { name: r.name, quantity: (map.get(key)?.quantity ?? 0) + r.quantity }); }
  return [...map.values()];
}
export function generateSchedule(issues: RepairIssue[], plans: Record<string, Planning>, rawScenario: Scenario, firstDate: string): Schedule {
  const scenario = scenarioSchema.parse(rawScenario);
  if (!/^\d{4}-\d\d-\d\d$/.test(firstDate) || !Number.isFinite(Date.parse(firstDate)) || new Date(firstDate).toISOString().slice(0, 10) !== firstDate) throw new Error("Choose a valid planning start date.");
  const dates = Array.from({ length: 7 }, (_, n) => new Date(Date.parse(`${firstDate}T12:00:00Z`) + n * 86400000)).filter(d => ![0, 6].includes(d.getUTCDay())).map(d => d.toISOString().slice(0, 10));
  const result: Schedule = { assignments: [], blockers: [], cost: 0, dates, materialsUsed: [] };
  const crews = scenario.crews.flatMap(c => Array.from({ length: c.count }, (_, i) => ({ ...c, instance: `${c.id}-${i + 1}`, label: c.count > 1 ? `${c.name} ${i + 1}` : c.name })));
  const materials = new Map(scenario.materials.map(m => [norm(m.name), m.quantity]));
  const equipment = new Map(scenario.equipment.map(m => [norm(m.name), m.quantity]));
  const overlap = (a: number, b: number, c: number, d: number) => a < d && c < b;
  const now = londonTime(`${firstDate}T08:00`);
  for (const issue of rankIssues(issues, plans, now)) {
    if (issue.status === "Closed") continue;
    const dueAt = plans[issue.id]?.dueAt ?? "";
    const horizonEnd = londonTime(`${new Date(Date.parse(`${firstDate}T12:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10)}T23:59`);
    const block = (reason: string) => result.blockers.push({ issueId: issue.id, title: issue.title, reason, dueAt, targetAtRisk: !!dueAt && londonTime(dueAt) <= horizonEnd });
    if ((plans[issue.id]?.priority ?? issue.priority) === "Emergency") { block("Immediate safety response required. Do not wait for this proposed routine schedule."); continue; }
    if (issue.referred) { block("Referral required; this is not a council repair assignment."); continue; }
    if (issue.status === "In progress") { block("Already in progress: confirm remaining work and existing resource commitments before rescheduling."); continue; }
    if (/^(scheduled|action scheduled)$/i.test(issue.rawStatus) || issue.commitment) { block(`Existing or unverified work-order commitment (${issue.commitment?.status ?? issue.rawStatus}): confirm its assigned crew and remaining scope before rescheduling.`); continue; }
    const parsed = planningSchema.safeParse(plans[issue.id] ?? defaultPlanning(issue, scenario));
    if (!parsed.success) { block("Planning details are incomplete or invalid. Review scope, priority evidence and target source."); continue; }
    const p = parsed.data;
    if (issue.source === "Public work order" && !p.scopeReady) { block("Public work order provenance needs review: confirm it is live, distinct work and check existing commitments before assigning a visit."); continue; }
    if (!issue.address && (issue.lat === null || issue.lon === null)) { block("Location needed before assigning a visit."); continue; }
    const candidates = crews.filter(c => c.trade === p.trade && c.people >= p.crewSize);
    if (!candidates.length) { block(`No qualified ${p.trade} crew with ${p.crewSize} people available in this scenario.`); continue; }
    const stock = sumRequirements(p.materials), kit = sumRequirements(p.equipment);
    const missing = stock.find(m => (materials.get(norm(m.name)) ?? 0) < m.quantity);
    if (missing) { block(`Insufficient material stock: ${missing.name} (${missing.quantity} needed).`); continue; }
    const missingKit = kit.find(k => (equipment.get(norm(k.name)) ?? 0) < k.quantity);
    if (missingKit) { block(`Equipment unavailable: ${missingKit.name} (${missingKit.quantity} needed).`); continue; }
    if (result.cost + p.cost > scenario.budget) { block("Scenario cash budget exhausted."); continue; }
    let placed: Assignment | null = null;
    for (const date of dates) {
      for (let start = scenario.start + scenario.buffer; start + p.minutes + scenario.buffer <= scenario.end; start += 15) {
        const end = start + p.minutes, busyStart = start - scenario.buffer, busyEnd = end + scenario.buffer;
        if (overlap(busyStart, busyEnd, 720, 750)) continue;
        const existing = result.assignments.filter(a => a.date === date);
        const crew = candidates.find(c => !existing.some(a => a.crewId === c.instance && overlap(busyStart, busyEnd, a.start - scenario.buffer, a.end + scenario.buffer)));
        if (!crew) continue;
        const kitFits = kit.every(k => {
          const relevant = existing.filter(a => overlap(busyStart, busyEnd, a.start - scenario.buffer, a.end + scenario.buffer));
          const points = [busyStart, ...relevant.map(a => a.start - scenario.buffer).filter(t => t > busyStart && t < busyEnd)];
          return points.every(t => k.quantity + relevant.filter(a => t >= a.start - scenario.buffer && t < a.end + scenario.buffer).reduce((n, a) => n + (a.equipment.find(e => norm(e.name) === norm(k.name))?.quantity ?? 0), 0) <= (equipment.get(norm(k.name)) ?? 0));
        });
        if (!kitFits) continue;
        placed = { issueId: issue.id, title: issue.title, action: p.action, priority: p.priority, date, start, end, crewId: crew.instance, crewName: crew.label, people: p.crewSize, cost: p.cost, materials: stock, equipment: kit, dueAt: p.dueAt, missesTarget: !!p.dueAt && londonTime(`${date}T${clockTime(end)}`) > londonTime(p.dueAt) };
        break;
      }
      if (placed) break;
    }
    if (!placed) { block("No compatible crew/equipment window inside the seven-day horizon. Adjust capacity, duration or scope."); continue; }
    result.assignments.push(placed); result.cost += p.cost;
    for (const m of stock) materials.set(norm(m.name), materials.get(norm(m.name))! - m.quantity);
  }
  result.materialsUsed = sumRequirements(result.assignments.flatMap(a => a.materials));
  return result;
}
