"use client";
import { useEffect, useState } from "react";
import { rankIssues, statuses } from "@/lib/dashboard/repairs";
import { type RepairsData } from "./useRepairs";
import IssueDetail from "./IssueDetail";

export function displayDate(value: string | null) { return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" }) : "Not recorded"; }
export default function RepairsList({ data }: { data: RepairsData }) {
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { const search = new URLSearchParams(window.location.search).get("search"); if (search) { setQuery(search); setSelectedId(search); } }, []);
  const filtered = rankIssues(data.issues, data.state.plans).filter(i => (status === "All" || i.status === status) && [i.title, i.id, i.description, i.category, i.address, i.postcode].some(v => v?.toLowerCase().includes(query.toLowerCase())));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 30) - 1));
  const visible = filtered.slice(currentPage * 30, currentPage * 30 + 30);
  const selected = visible.find(i => i.id === selectedId) ?? visible[0];
  function selectIssue(id: string) {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 950px)").matches) requestAnimationFrame(() => document.querySelector(".ops-detail")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  }
  return <><div className="ops-list-tools"><div className="ops-status-tabs" role="group" aria-label="Repair status">{["All", ...statuses].map(s => <button key={s} aria-pressed={status === s} className={status === s ? "selected" : ""} onClick={() => { setStatus(s); setPage(0); setSelectedId(null); }}>{s}<span>{data.issues.filter(i => s === "All" || i.status === s).length}</span></button>)}</div><label className="ops-search"><span className="pm-sr-only">Search repairs</span><input value={query} onChange={e => { setQuery(e.target.value); setPage(0); setSelectedId(null); }} placeholder="Search issue, location or reference…" type="search" /></label></div>
    <div className="ops-priority-note">Ordered by priority → recorded policy target → original report date. Unassessed issues need inspection; source categories do not establish severity.</div>
    <div className="ops-repairs-grid"><section className="pm-card ops-register" aria-label="Repair register"><div className="pm-panel-header"><h2>{filtered.length} {filtered.length === 1 ? "record" : "records"}</h2><span className="pm-muted">Priority order</span></div><div className="ops-register-head"><span>Issue</span><span>Priority / status</span></div>
      {visible.length ? <ul className="ops-record-list">{visible.map((i, index) => { const priority = data.state.plans[i.id]?.priority ?? i.priority; return <li key={i.id}><button className={`ops-record ${selected?.id === i.id ? "selected" : ""}`} aria-pressed={selected?.id === i.id} onClick={() => selectIssue(i.id)}><div className="ops-record-main"><span className="ops-rank">{currentPage * 30 + index + 1}</span><div><h3>{i.title}</h3><p>{i.address ?? i.category}</p><small>{i.id} · Raised {displayDate(i.raisedAt)}</small></div></div><div className="ops-record-meta"><span className={`pm-badge ${priority.toLowerCase()}`}>{priority}</span><span className={`ops-status status-${i.status.replace(" ", "-").toLowerCase()}`}>{i.status}</span>{data.state.plans[i.id] ? <small>Local plan</small> : i.proposal ? <small>AI proposal</small> : null}</div></button></li>; })}</ul> : <div className="pm-empty"><h3>{data.loading ? "Loading the report register…" : "No matching records"}</h3><p>{data.error ? "The report service is unavailable. Retry above." : "Try another status or search term."}</p></div>}
      <div className="ops-pagination"><button className="ops-secondary" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); setSelectedId(null); }}>Previous</button><span>Page {currentPage + 1} of {Math.max(1, Math.ceil(filtered.length / 30))}</span><button className="ops-secondary" disabled={(currentPage + 1) * 30 >= filtered.length} onClick={() => { setPage(currentPage + 1); setSelectedId(null); }}>Next</button></div></section>
      {selected ? <IssueDetail key={`${selected.id}:${JSON.stringify(data.state.plans[selected.id])}`} issue={selected} planning={data.state.plans[selected.id]} scenario={data.state.scenario} clear={() => { const plans = { ...data.state.plans }; delete plans[selected.id]; data.update({ plans }); data.setNotice("Local planning task removed. Source report unchanged."); }} save={planning => { data.update({ plans: { ...data.state.plans, [selected.id]: planning } }); data.setNotice(`Planning details saved for ${selected.id}. Regenerate the schedule to include changes.`); }} /> : <section className="pm-card ops-detail-empty"><h2>Issue details</h2><p>Select an issue to see its evidence and repair planning requirements.</p></section>}
    </div></>;
}
