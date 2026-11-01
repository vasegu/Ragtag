import { z } from "zod";
import type { Severity } from "./model";

export const statuses = ["Open", "In progress", "Closed"] as const;
export const trades = ["inspection", "highways", "waste", "cleansing", "electrical", "enforcement", "arboriculture", "drainage", "specialist"] as const;
export type Trade = typeof trades[number];
export const requirementsSchema = z.array(z.object({ name: z.string().trim().min(1).max(100), quantity: z.number().finite().positive().max(10000) })).max(30);
export const equipmentSchema = requirementsSchema.refine(v => v.every(r => Number.isInteger(r.quantity)), "Equipment quantities must be whole units.");
export const planningSchema = z.object({
  priority: z.enum(["Emergency", "High", "Elevated", "Routine", "Unassessed"]),
  reason: z.string().trim().max(1000),
  action: z.enum(["Inspect", "Make safe", "Repair"]),
  recommendation: z.string().trim().max(2000),
  trade: z.enum(trades), minutes: z.number().int().min(15).max(480),
  crewSize: z.number().int().min(1).max(12), cost: z.number().finite().min(0).max(1000000),
  materials: requirementsSchema, equipment: equipmentSchema, scopeReady: z.boolean(),
  dueAt: z.string().max(30).refine(v => !v || (Number.isFinite(planningTime(v)) && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?:Z|[+-]\d\d:\d\d)?$/.test(v)), "Enter a valid London date and time."),
  policyUrl: z.string().max(1000).refine(v => !v || /^https:\/\//.test(v) && z.string().url().safeParse(v).success, "Use an HTTPS policy source."),
  deadlineAction: z.enum(["Inspect", "Make safe", "Repair"]),
}).superRefine((p, ctx) => {
  if (p.priority !== "Unassessed" && !p.reason.trim()) ctx.addIssue({ code: "custom", path: ["reason"], message: "Record the evidence for this planning priority." });
  if (!!p.dueAt !== !!p.policyUrl) ctx.addIssue({ code: "custom", path: ["dueAt"], message: "A policy target needs both a date and its source." });
  if (p.action !== "Inspect" && (!p.scopeReady || !p.recommendation)) ctx.addIssue({ code: "custom", path: ["scopeReady"], message: "Confirm the proposed scope, ownership and resource quantities before planning repair work." });
  if (p.action !== "Inspect" && (p.trade === "inspection" || p.priority === "Unassessed")) ctx.addIssue({ code: "custom", path: ["trade"], message: "Assess the priority and choose a repair trade before planning physical work." });
  if (p.dueAt && p.deadlineAction !== p.action) ctx.addIssue({ code: "custom", path: ["deadlineAction"], message: "The target must apply to the action being scheduled." });
});
export type Planning = z.infer<typeof planningSchema>;
export type Requirement = z.infer<typeof requirementsSchema>[number];
export type RepairIssue = {
  id: string; title: string; description: string | null; category: string;
  source: "FixMyStreet" | "Public work order"; sourceUrl: string | null;
  status: typeof statuses[number]; rawStatus: string; priority: Severity;
  raisedAt: string | null; updatedAt: string | null; closedAt: string | null;
  address: string | null; postcode: string | null; lat: number | null; lon: number | null;
  owner: string | null; photos: string[]; recommendation: string | null;
  deadline: null; referred: boolean;
  proposal?: { policyLevel: string; reason: string; rating: number | null; mode: string };
  commitment?: { status: string; resourceId: string | null };
  workOrder: { trade: string; crewSize: number | null; minutes: number | null; materials: string[]; equipment: string[]; costLow: number | null; costHigh: number | null; mode: string; access: string | null; quantity: string | null; sizeBand: string | null; assignedUnit: string | null } | null;
};
export const repairIssueSchema: z.ZodType<RepairIssue> = z.object({
  id: z.string(), title: z.string(), description: z.string().nullable(), category: z.string(),
  source: z.enum(["FixMyStreet", "Public work order"]), sourceUrl: z.string().url().nullable(),
  status: z.enum(statuses), rawStatus: z.string(), priority: z.enum(["Emergency", "High", "Elevated", "Routine", "Unassessed"]),
  raisedAt: z.string().nullable(), updatedAt: z.string().nullable(), closedAt: z.string().nullable(),
  address: z.string().nullable(), postcode: z.string().nullable(), lat: z.number().nullable(), lon: z.number().nullable(), owner: z.string().nullable(),
  photos: z.array(z.string().url()), recommendation: z.string().nullable(), deadline: z.null(), referred: z.boolean(),
  proposal: z.object({ policyLevel: z.string(), reason: z.string(), rating: z.number().nullable(), mode: z.string() }).optional(),
  commitment: z.object({ status: z.string(), resourceId: z.string().nullable() }).optional(),
  workOrder: z.object({ trade: z.string(), crewSize: z.number().nullable(), minutes: z.number().nullable(), materials: z.array(z.string()), equipment: z.array(z.string()), costLow: z.number().nullable(), costHigh: z.number().nullable(), mode: z.string(), access: z.string().nullable(), quantity: z.string().nullable(), sizeBand: z.string().nullable(), assignedUnit: z.string().nullable() }).nullable(),
});
export const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const numeric = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const iso = (v: unknown): string | null => text(v) && Number.isFinite(Date.parse(String(v))) ? new Date(String(v)).toISOString() : null;
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
export function sourceStatus(state: unknown, fixed = false): RepairIssue["status"] {
  const s = text(state)?.toLowerCase() ?? "";
  if (fixed || /^(fixed\b|closed\b|resolved\b|duplicate\b|not responsible\b|unable to fix\b|no further action\b|done$)/.test(s)) return "Closed";
  if (/^in progress$|^dispatched$|^work started$|^underway$/.test(s)) return "In progress";
  return "Open";
}
export function fromReport(r: Record<string, unknown>, baseUrl: string): RepairIssue {
  const id = String(r.id);
  const photos = Array.isArray(r.report_photos) ? r.report_photos : [];
  return {
    id: `fms-${id}`, source: "FixMyStreet", sourceUrl: `https://www.fixmystreet.com/report/${encodeURIComponent(id)}`,
    title: text(r.title) ?? text(r.category) ?? "Street issue", category: text(r.category) ?? "Uncategorised",
    description: text(r.detail) ?? text(r.description) ?? text(r.body),
    status: sourceStatus(r.state ?? r.status, r.is_fixed === true), rawStatus: text(r.state ?? r.status) ?? "Not recorded",
    priority: "Unassessed", raisedAt: iso(r.created_at), updatedAt: iso(r.last_update), closedAt: null,
    address: text(r.address), postcode: text(r.postcode), lat: numeric(r.lat), lon: numeric(r.lon),
    owner: text(r.council), photos: photos.flatMap(p => {
      const path = p && typeof p === "object" ? text(p.storage_path) : null;
      return path && !path.includes("..") && !path.startsWith("/") && !path.includes(":") ? [`${baseUrl}/storage/v1/object/public/images/${path.split("/").map(encodeURIComponent).join("/")}`] : [];
    }), recommendation: null, deadline: null, referred: false, workOrder: null,
  };
}
export function fromWorkOrder(r: Record<string, unknown>): RepairIssue {
  return {
    id: `job-${String(r.problem_id)}`, source: "Public work order", sourceUrl: null,
    title: text(r.category) ?? "Public work order", category: text(r.category) ?? "Uncategorised",
    description: text(r.size_description), status: sourceStatus(r.status), rawStatus: text(r.status) ?? "Not recorded",
    priority: "Unassessed", raisedAt: null, updatedAt: iso(r.updated_at), closedAt: null,
    address: text(r.address), postcode: null, lat: numeric(r.lat), lon: numeric(r.lon), owner: null,
    photos: [], recommendation: text(r.size_description), deadline: null, referred: r.delivery_mode === "refer" || r.status === "referred",
    workOrder: { trade: text(r.trade) ?? "Not recorded", crewSize: numeric(r.crew_size), minutes: numeric(r.minutes_max), materials: strings(r.materials), equipment: strings(r.equipment), costLow: numeric(r.cost_low), costHigh: numeric(r.cost_high), mode: text(r.delivery_mode) ?? "Unconfirmed", access: text(r.traffic_management), quantity: text(r.quantity), sizeBand: text(r.size_band), assignedUnit: text(r.supply_unit_id) },
  };
}
export function applyPlanning(issue: RepairIssue, planning?: Planning): RepairIssue {
  return planning ? { ...issue, priority: planning.priority } : issue;
}
export function planningTime(value: string) {
  if (/Z$|[+-]\d\d:\d\d$/.test(value)) return Date.parse(value);
  const utc = Date.parse(`${value}Z`);
  if (!Number.isFinite(utc)) return NaN;
  const offset = new Intl.DateTimeFormat("en", { timeZone: "Europe/London", timeZoneName: "shortOffset" }).formatToParts(new Date(utc)).find(p => p.type === "timeZoneName")?.value;
  const time = utc - (offset === "GMT+1" ? 3600000 : 0);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(time));
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  const roundtrip = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  return roundtrip === value.slice(0, 16) ? time : NaN;
}
export function rankIssues(issues: RepairIssue[], plans: Record<string, Planning> = {}, now = Date.now()) {
  const weights: Record<Severity, number> = { Emergency: 0, High: 2, Unassessed: 3, Elevated: 4, Routine: 5 };
  const priority = (i: RepairIssue) => i.status === "Closed" ? 9 : (plans[i.id]?.priority ?? i.priority) === "Emergency" ? 0 : plans[i.id]?.dueAt && planningTime(plans[i.id].dueAt) <= now + 86400000 ? 1 : weights[plans[i.id]?.priority ?? i.priority];
  const date = (i: RepairIssue) => Date.parse(i.raisedAt ?? "") || Infinity;
  return [...issues].sort((a, b) => priority(a) - priority(b) || (planningTime(plans[a.id]?.dueAt ?? "") || Infinity) - (planningTime(plans[b.id]?.dueAt ?? "") || Infinity) || date(a) - date(b) || a.id.localeCompare(b.id));
}
export function readPlanning(raw: unknown): Record<string, Planning> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).slice(0, 10000).flatMap(([id, value]) => { const p = planningSchema.safeParse(value); return p.success && /^(fms-|job-)/.test(id) ? [[id, p.data]] : []; }));
}
