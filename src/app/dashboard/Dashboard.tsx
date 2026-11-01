"use client";

import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { actions, ageBand, ageLabels, areas, capacity, decide, finance, readDecisions, severities, snapshot, storageKey, summarise, type Action, type AreaFilter, type Decisions, type Decision, type Issue, type Severity } from "@/lib/dashboard/model";

const money = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
const tone = (s: Severity) => s.toLowerCase();
const statusLabel: Record<Decision["status"], string> = { approved: "Approved", changes: "Changes requested", deferred: "Deferred" };
function Icon({ name, size = 21 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9M9 21v-8h6v8" /></>,
    repair: <path d="m14 6 4 4m-9 3-6 6a2 2 0 0 0 3 3l6-6a7 7 0 0 0 9-9l-5 5-4-4 5-5a7 7 0 0 0-9 9Z" />,
    approval: <><rect x="5" y="3" width="14" height="19" rx="2" /><path d="M9 8h6M9 12h6m-6 5 2 2 4-4" /></>,
    resources: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-4a6 6 0 0 1 12 0v4m1-17a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v3" /></>,
    report: <><path d="M4 21V11m6 10V4m6 17v-7m6 7V8" /></>,
    arrow: <path d="m9 5 7 7-7 7" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 2v6m10-6v6M3 11h18" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.arrow}</svg>;
}
function Brand() { return <div className="pm-brand"><svg width="41" height="41" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="currentColor" /><path d="M12 2v36m16-36v36M12 20h16" stroke="var(--canvas)" strokeWidth="6" /></svg><span>One <br />Hackney</span></div>; }
function Badge({ severity }: { severity: Severity }) { return <span className={`pm-badge ${tone(severity)}`}>{severity}</span>; }
function Drawer({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; el?.showModal(); return () => el?.close(); }, []);
  return <dialog ref={ref} className="pm-drawer" aria-labelledby="pm-drawer-title" onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}><div className="pm-drawer-inner"><header><div><span className="pm-label">One Hackney · Demo</span><h2 id="pm-drawer-title">{title}</h2></div><button className="pm-icon-button" aria-label="Close panel" onClick={close} autoFocus><Icon name="close" /></button></header>{children}</div></dialog>;
}
function DeliveryChart({ data }: { data: ReturnType<typeof summarise>["trend"] }) {
  const max = Math.max(10, ...data.map(d => Math.max(d.fixed, d.arrivals)));
  const ceiling = Math.ceil(max / 10) * 10;
  const width = 470, height = 138, step = width / data.length;
  const colors: Record<string, string> = { High: "#568b80", Elevated: "#8bb0a3", Routine: "#c2d1b6", Emergency: "#bf7965", Unassessed: "#c7cdca" };
  const [hover, setHover] = useState<number | null>(null);
  return <div className="pm-chart-wrap"><svg viewBox="0 0 540 195" role="img" aria-label={`Delivery trend: ${data.reduce((n, d) => n + d.fixed, 0)} reported fixed and ${data.reduce((n, d) => n + d.arrivals, 0)} new issues. Exact counts in chart details.`}>
    {[0, 1, 2, 3].map(t => <g key={t}><line x1="35" y1={15 + height * t / 3} x2="520" y2={15 + height * t / 3} stroke="#e7e9e4" /><text x="26" y={19 + height * t / 3} textAnchor="end">{Math.round(ceiling * (1 - t / 3))}</text></g>)}
    {data.map((d, index) => { let offset = 0; return <g key={d.label} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}><title>{`${d.label}: ${d.fixed} reported fixed, ${d.arrivals} new`}</title>{severities.map((s, si) => { const h = d.counts[si] / ceiling * height; const y = 15 + height - offset - h; offset += h; return <rect key={s} x={43 + index * step} y={y} width={step * 0.65} height={h} fill={colors[s]} rx="1" />; })}<text x={43 + index * step + step * 0.325} y="180" textAnchor="middle">{d.label}</text></g>; })}
    <polyline points={data.map((d, i) => `${43 + i * step + step * 0.325},${15 + height - d.arrivals / ceiling * height}`).join(" ")} fill="none" stroke="#64716f" strokeWidth="2" />
    {data.map((d, i) => <circle key={d.label} cx={43 + i * step + step * 0.325} cy={15 + height - d.arrivals / ceiling * height} r={hover === i ? 5 : 3.5} fill="#64716f"><title>{`${d.label}: ${d.arrivals} new`}</title></circle>)}
  </svg><div className="pm-chart-legend">{["Routine", "Elevated", "High", "New"].map(s => <span key={s}><i style={{ background: colors[s] ?? "#64716f" }} />{s}</span>)}</div></div>;
}
function Review({ action, decision, save }: { action: Action; decision?: Decision; save: (status: Decision["status"], reason: string) => string | null }) {
  const [choice, setChoice] = useState<Decision["status"]>("approved");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  function submit(e: FormEvent) { e.preventDefault(); setError(save(choice, reason) ?? ""); }
  return <><div className="pm-review-summary"><Badge severity={action.severity} /><p>{action.task} · {action.mode}</p><strong>{money(action.cost)}</strong><span>Estimated additional cash</span></div>
    <dl className="pm-facts"><div><dt>Issue</dt><dd>{action.issueId}</dd></div><div><dt>Service</dt><dd>{action.area}</dd></div><div><dt>Proposed slot</dt><dd>{action.due}</dd></div></dl>
    <section className="pm-review-section"><h3>Why this action</h3><p>{action.evidence}</p></section><section className="pm-review-section"><h3>If we wait</h3><p>{action.waiting}</p></section><section className="pm-review-section"><h3>Delivery comparison</h3><p>{action.alternative}</p></section>
    <p className="pm-note">Illustrative costs and availability. Approval records a demo decision; it does not book or dispatch a crew.</p>
    {decision ? <div className="pm-decision-record"><h3>{statusLabel[decision.status]}</h3><p>{new Date(decision.at).toLocaleString("en-GB")}</p>{decision.reason && <p>{decision.reason}</p>}</div> : <form className="pm-review-form" onSubmit={submit}><fieldset><legend>Decision</legend><div className="pm-choice-row">{(["approved", "changes", "deferred"] as const).map(s => <label key={s} className={choice === s ? "selected" : ""}><input type="radio" name="decision" value={s} checked={choice === s} onChange={() => { setChoice(s); setError(""); }} />{s === "approved" ? "Approve" : s === "changes" ? "Request changes" : "Defer"}</label>)}</div></fieldset><label htmlFor="decision-reason">{choice === "approved" ? "Note (optional)" : "Reason (required)"}</label><textarea id="decision-reason" rows={3} value={reason} maxLength={1000} required={choice !== "approved"} onChange={e => setReason(e.target.value)} placeholder="Add context for the decision…" />{error && <p className="pm-error" role="alert">{error}</p>}<button className="pm-button" type="submit">{choice === "approved" ? "Approve proposed action" : choice === "changes" ? "Request changes" : "Defer action"}</button></form>}
  </>;
}

export default function Dashboard() {
  const [area, setArea] = useState<AreaFilter>("all");
  const [days, setDays] = useState(30);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [review, setReview] = useState<Action | null>(null);
  const [list, setList] = useState<{ title: string; issues: Issue[] } | null>(null);
  const [showReviewed, setShowReviewed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const approvalsHeading = useRef<HTMLHeadingElement>(null);
  const restoreApprovalFocus = useRef(false);
  const memoryOnly = useRef(false);
  useEffect(() => {
    try { setDecisions(readDecisions(localStorage.getItem(storageKey))); } catch { memoryOnly.current = true; setStorageWarning("Browser storage unavailable. Decisions last for this visit only."); }
    const sync = (event: StorageEvent) => { if (!memoryOnly.current && (event.key === storageKey || event.key === null)) setDecisions(readDecisions(event.newValue)); };
    window.addEventListener("storage", sync);
    setReady(true);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => { if (!review && restoreApprovalFocus.current) { approvalsHeading.current?.focus(); restoreApprovalFocus.current = false; } }, [review]);
  const summary = summarise(area, days);
  const cash = finance(area, days, decisions);
  const week = capacity(area);
  const covered = week.reduce((n, d) => n + d.covered, 0), required = week.reduce((n, d) => n + d.required, 0);
  const selectedActions = actions.filter(a => area === "all" || a.area === area);
  const pending = selectedActions.filter(a => !decisions[a.id]);
  const reviewed = selectedActions.filter(a => decisions[a.id]);
  const visibleActions = showReviewed ? reviewed : pending;
  const openList = (title: string, rows: Issue[]) => setList({ title, issues: rows });
  function persist(next: Decisions) { setDecisions(next); try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, decisions: next })); } catch { memoryOnly.current = true; setStorageWarning("Could not save to this browser. Decisions last for this visit only."); } }
  function save(status: Decision["status"], reason: string) {
    if (!review) return "Select an action.";
    try {
      let latest = decisions;
      if (!memoryOnly.current) {
        try { latest = readDecisions(localStorage.getItem(storageKey)); } catch { memoryOnly.current = true; }
      }
      const next = decide(latest, review.id, status, reason, Math.min(finance(area, days, latest).available, finance(review.area, days, latest).available));
      persist(next);
      setNotice(`${review.title}: ${statusLabel[status].toLowerCase()}. ${status === "approved" ? `${money(review.cost)} reserved in the demo plan.` : "Decision recorded."}`);
      restoreApprovalFocus.current = true;
      setReview(null);
      return null;
    } catch (e) { return e instanceof Error ? e.message : "Could not record decision."; }
  }
  return <div className="pm-dashboard"><a href="#pm-content" className="pm-skip">Skip to dashboard</a><aside className="pm-sidebar"><Brand /><nav aria-label="Dashboard"><a className="active" href="#pm-content"><Icon name="home" />Overview</a><button onClick={() => openList("Open repairs", summary.open)}><Icon name="repair" />Repairs</button><a href="#pm-approvals"><Icon name="approval" />Approvals<span className="pm-nav-count">{pending.length}</span></a><a href="#pm-capacity"><Icon name="resources" />Resources</a><a href="#pm-delivery"><Icon name="report" />Reports</a></nav><div className="pm-sidebar-footer"><span>Hackney<br /><small>London Borough</small></span><button className="pm-text-button" onClick={() => setResetting(true)} disabled={!ready}>Reset demo</button></div></aside>
    <main id="pm-content" className="pm-content"><header className="pm-header"><div><h1>Repairs overview</h1><p>1 November 2026 <span className="pm-header-divider">/</span> <span className="pm-demo">Demo · Illustrative data</span></p></div><div className="pm-filters"><label><span className="pm-sr-only">Service area</span><select value={area} onChange={e => { setArea(e.target.value as AreaFilter); setShowReviewed(false); }}><option value="all">All service areas</option>{areas.map(a => <option key={a}>{a}</option>)}</select></label><label><Icon name="calendar" size={18} /><span className="pm-sr-only">Reporting period</span><select value={days} onChange={e => setDays(Number(e.target.value))}><option value={30}>Last 30 days</option><option value={7}>Last 7 days</option></select></label></div></header>
    {(notice || storageWarning) && <div className="pm-notices" role="status">{storageWarning || notice}<button className="pm-icon-button" aria-label="Dismiss notification" onClick={() => { setNotice(""); setStorageWarning(""); }}><Icon name="close" size={16} /></button></div>}
    <section className="pm-card pm-finance" aria-label={`Illustrative ${days}-day financial envelope`}><div className="pm-finance-values">{[[`Budget · ${days} days`, cash.budget], ["Spent", cash.spent], ["Committed", cash.committed], ["Available", cash.available]].map(([label, amount], i) => <div key={label} className={`pm-finance-value finance-${i}`}><span>{label}</span><strong>{money(amount as number)}</strong></div>)}</div><div className="pm-budget-bar" role="img" aria-label={`${money(cash.spent)} spent, ${money(cash.committed)} committed, ${money(cash.available)} available of ${money(cash.budget)}`}><span className="spent" style={{ width: `${cash.spent / cash.budget * 100}%` }} /><span className="committed" style={{ width: `${cash.committed / cash.budget * 100}%` }} /><span className="available" style={{ flex: 1 }} /></div></section>
    <div className="pm-grid"><section className="pm-card pm-backlog"><div className="pm-panel-header"><h2>Pending repairs</h2><button className="pm-icon-button" aria-label="View all open repairs" onClick={() => openList("Open repairs", summary.open)}><Icon name="arrow" size={18} /></button></div><p className="pm-metric">{summary.open.length} <span>open</span></p><p className="pm-subtitle">{summary.open.filter(i => i.severity === "High").length} high <span>·</span> {summary.open.filter(i => i.severity === "Unassessed").length} unassessed <small>Current snapshot</small></p>
      <div className="pm-table-scroll"><table className="pm-age-table"><caption className="pm-sr-only">Current open issues by severity and age. Select a count to view issues.</caption><thead><tr><th scope="col">Issue age</th>{ageLabels.map(l => <th scope="col" key={l}>{l}</th>)}<th scope="col">Total</th></tr></thead><tbody>{severities.map(s => { const rows = summary.open.filter(i => i.severity === s); return <tr key={s} className={tone(s)}><th scope="row">{s}</th>{ageLabels.map((l, i) => { const matches = rows.filter(r => ageBand(r.createdAt) === i); return <td key={l}><button disabled={!matches.length} aria-label={`${s}, ${l}: ${matches.length} issues`} onClick={() => openList(`${s} · ${l}`, matches)}>{matches.length || "—"}</button></td>; })}<td className="pm-row-total">{rows.length}</td></tr>; })}</tbody></table></div>
      <div className="pm-card-footer"><button className="pm-overdue" onClick={() => openList("Overdue actions", summary.open.filter(i => i.overdue))}><span>!</span>{summary.open.filter(i => i.overdue).length} overdue</button><span className="pm-muted">{summary.open.filter(i => ageBand(i.createdAt) < 0).length} unknown age</span></div></section>
    <section className="pm-card pm-approvals" id="pm-approvals"><div className="pm-panel-header"><h2 ref={approvalsHeading} tabIndex={-1}>Approvals</h2>{reviewed.length > 0 && <button className="pm-text-button" onClick={() => setShowReviewed(!showReviewed)}>{showReviewed ? "Pending" : `Reviewed (${reviewed.length})`}</button>}</div><p className="pm-metric">{showReviewed ? reviewed.length : pending.length} <span>{showReviewed ? "reviewed" : "to review"}</span></p><div className="pm-approval-list">{visibleActions.length ? visibleActions.map(a => <div className="pm-approval-row" key={a.id}><div><div className="pm-approval-title"><h3>{a.title}</h3><Badge severity={a.severity} /></div><p>{a.task} <span>·</span> {a.mode} <span>·</span> {money(a.cost)}</p>{decisions[a.id] && <span className="pm-record-status">{statusLabel[decisions[a.id].status]}</span>}</div><button className="pm-button" disabled={!ready} aria-label={`${decisions[a.id] ? "View" : "Review"} ${a.title}`} onClick={() => setReview(a)}>{decisions[a.id] ? "View" : "Review"}</button></div>) : <div className="pm-empty"><Icon name="approval" size={30} /><h3>{showReviewed ? "No reviewed actions" : "Nothing awaiting review"}</h3><p>{showReviewed ? "Decisions will appear here." : "No proposed actions need your decision in this service area."}</p></div>}</div></section>
    <section className="pm-card pm-delivery" id="pm-delivery"><div className="pm-panel-header"><h2>Delivery</h2><button className="pm-icon-button" aria-label="View reported fixes" onClick={() => openList(`Reported fixed · last ${days} days`, summary.fixed)}><Icon name="arrow" size={18} /></button></div><p className="pm-metric">{summary.fixed.length} <span>reported fixed</span></p><p className="pm-muted">Last {days} days</p><DeliveryChart data={summary.trend} /><div className="pm-card-footer"><p><strong>{summary.arrivals} new</strong><span className="pm-dot">·</span>Backlog {summary.arrivals - summary.fixed.length >= 0 ? "+" : ""}{summary.arrivals - summary.fixed.length}</p><button className="pm-text-button" onClick={() => openList(`Reported fixed · last ${days} days`, summary.fixed)}>Details</button></div></section>
    <section className="pm-card pm-capacity" id="pm-capacity"><div className="pm-panel-header"><h2>Weekly capacity <span className="pm-proposed">Proposed</span></h2><span className="pm-badge elevated">{required - covered}h shortfall</span></div><p className="pm-metric">{covered} <span className="pm-capacity-denominator">/ {required} hours</span></p><p className="pm-muted">2–6 November</p><div className="pm-coverage" role="img" aria-label={`Proposed coverage: ${covered} of ${required} crew-hours. ${week.map(d => `${d.day} ${d.covered}/${d.required}`).join(", ")}`}>
      {week.map(d => <div key={d.day} className="pm-coverage-day"><strong>{d.covered} / {d.required}</strong><div className="pm-squares">{Array.from({ length: Math.ceil(Math.max(...week.map(d => d.required)) / 2) }, (_, i) => <i key={i} title={`${d.day}: ${i * 2 < d.covered ? "Covered" : i * 2 < d.required ? "Shortfall" : "Outside demand"}, 2 hours`} className={i * 2 < d.covered ? "covered" : i * 2 < d.required ? "shortfall" : "unused"} />).reverse()}</div><span>{d.day}</span></div>)}
      </div><div className="pm-card-footer"><div className="pm-inline-legend"><span><i className="covered" />Covered</span><span><i className="shortfall" />Shortfall</span></div><span className="pm-muted">Each square · 2h</span></div></section></div><footer className="pm-page-footer">Fictional planning scenario · Snapshot {snapshot} · Decisions stay in this browser</footer></main>
    {review && <Drawer title={review.title} close={() => setReview(null)}><Review key={review.id} action={review} decision={decisions[review.id]} save={save} /></Drawer>}
    {list && <Drawer title={list.title} close={() => setList(null)}><p className="pm-muted pm-list-summary">{list.issues.length} issues · {area === "all" ? "All service areas" : area}</p>{list.issues.length ? <ul className="pm-issue-list">{list.issues.map(i => <li key={i.id}><div className="pm-issue-heading"><span>{i.id}</span><Badge severity={i.severity} /></div><h3>{i.title}</h3><p>{i.area} · {i.resolvedAt ? "Reported fixed" : "Open"} · {ageBand(i.createdAt) < 0 ? "Age unknown" : `${Math.floor((Date.parse(snapshot) - Date.parse(i.createdAt!)) / 86400000) + 1} d since report`}</p></li>)}</ul> : <div className="pm-empty"><h3>No matching issues</h3><p>Try another service area or reporting period.</p></div>}</Drawer>}
    {resetting && <Drawer title="Reset demo decisions?" close={() => setResetting(false)}><p className="pm-note">Clear this browser’s approval history and release the demo budget reservations. The original issues and proposed actions will remain.</p><button className="pm-button" onClick={() => { persist({}); setShowReviewed(false); setNotice("Demo decisions reset. Budget reservations released."); setResetting(false); }}>Reset decisions</button></Drawer>}
  </div>;
}
