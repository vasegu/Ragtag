"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { readPlanning, repairIssueSchema, type Planning, type RepairIssue } from "@/lib/dashboard/repairs";
import { defaultScenario, londonToday, scenarioSchema, type Scenario } from "@/lib/dashboard/scheduler";

const key = "one-hackney-resource-scenario-v1";
export type WorkspaceState = { scenario: Scenario; plans: Record<string, Planning>; startDate: string; generated: string; accepted: string };
const initial: WorkspaceState = { scenario: defaultScenario, plans: {}, startDate: "", generated: "", accepted: "" };
function restore(raw: string | null): WorkspaceState {
  try {
    const p = JSON.parse(raw ?? "null");
    if (p?.version !== 1) return { ...initial, startDate: londonToday() };
    const scenario = scenarioSchema.safeParse(p.scenario);
    const startDate = typeof p.startDate === "string" && /^\d{4}-\d\d-\d\d$/.test(p.startDate) && Number.isFinite(Date.parse(p.startDate)) ? p.startDate : londonToday();
    return { scenario: scenario.success ? scenario.data : defaultScenario, plans: readPlanning(p.plans), startDate, generated: typeof p.generated === "string" ? p.generated : "", accepted: typeof p.accepted === "string" ? p.accepted : "" };
  } catch { return { ...initial, startDate: londonToday() }; }
}
const responseSchema = z.object({ issues: z.array(repairIssueSchema), total: z.number().int().nonnegative(), hasMore: z.boolean(), nextOffset: z.number().int().nonnegative(), warning: z.string().optional() });
export function useRepairs() {
  const [issues, setIssues] = useState<RepairIssue[]>([]);
  const [state, setState] = useState<WorkspaceState>(initial);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const memoryOnly = useRef(false);
  useEffect(() => {
    try { setState(restore(localStorage.getItem(key))); } catch { memoryOnly.current = true; setState({ ...initial, startDate: londonToday() }); setWarning("Browser storage unavailable. Planning changes last for this visit only."); }
    const sync = (e: StorageEvent) => { if (!memoryOnly.current && (e.key === key || e.key === null)) setState(restore(e.newValue)); };
    window.addEventListener("storage", sync); setReady(true);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let cancelled = false;
    async function load() {
      setLoading(true); setError(""); const all: RepairIssue[] = [];
      for (const source of ["reports", "jobs"]) {
        try {
          let offset = 0, more = true;
          while (more && !cancelled) {
            const r = await fetch(`/api/dashboard/issues?source=${source}&offset=${offset}`, { signal: controller.signal, cache: "no-store" });
            const raw = await r.json();
            if (!r.ok) throw new Error(raw.error ?? "Could not load reports.");
            const data = responseSchema.parse(raw);
            if (data.warning) setWarning(data.warning);
            if (data.hasMore && (data.issues.length === 0 || data.nextOffset <= offset)) throw new Error("Report pagination returned an incomplete page. Please refresh.");
            all.push(...data.issues); more = data.hasMore; offset = data.nextOffset;
            if (!cancelled) setIssues([...new Map(all.map(i => [i.id, i])).values()]);
          }
        } catch (e) {
          if (cancelled) return;
          if (source === "reports") setError(e instanceof Error ? e.message : "Could not load the public report feed.");
          else setWarning("Public work orders unavailable; showing the public reports loaded so far.");
        }
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [revision]);
  const update = useCallback((patch: Partial<WorkspaceState>) => {
    const next = { ...state, ...patch }; setState(next);
    try { localStorage.setItem(key, JSON.stringify({ version: 1, ...next })); }
    catch { memoryOnly.current = true; setWarning("Could not save this planning scenario. Changes last for this visit only."); }
  }, [state]);
  return { issues, state, ready, loading, error, warning, notice, setNotice, update, refresh: () => setRevision(n => n + 1) };
}
export type RepairsData = ReturnType<typeof useRepairs>;
export function fingerprint(issues: RepairIssue[], state: WorkspaceState) {
  return JSON.stringify({ schedulerVersion: 1, issues: [...issues].sort((a, b) => a.id.localeCompare(b.id)), plans: state.plans, scenario: state.scenario, startDate: state.startDate });
}
