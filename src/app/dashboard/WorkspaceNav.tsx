import Link from "next/link";

export default function WorkspaceNav({ active, pending, onReset, ready = true }: { active: "overview" | "repairs" | "schedule"; pending?: number; onReset?: () => void; ready?: boolean }) {
  const items = [
    ["overview", "Overview", "/dashboard", "M3 10 12 3l9 7M5 9v12h14V9M9 21v-8h6v8"],
    ["repairs", "Repairs", "/dashboard/repairs", "m14 6 4 4m-9 3-6 6a2 2 0 0 0 3 3l6-6a7 7 0 0 0 9-9l-5 5-4-4 5-5a7 7 0 0 0-9 9"],
    ["schedule", "Schedule", "/dashboard/schedule", "M3 6h18v15H3zM7 3v6m10-6v6M3 11h18m-13 4h3m3 0h3"],
    ["approvals", "Approvals", "/dashboard#pm-approvals", "M5 3h14v19H5zM9 8h6m-6 4h6m-6 5 2 2 4-4"],
    ["resources", "Resources", "/dashboard/schedule#resources", "M4 21v-4a5 5 0 0 1 10 0v4m-8-14a3 3 0 1 0 6 0 3 3 0 0 0-6 0m12 6a5 5 0 0 1 3 5v3"],
    ["reports", "Reports", "/dashboard#pm-delivery", "M4 21V11m6 10V4m6 17v-7m6 7V8"],
  ];
  return <aside className="pm-sidebar"><Link href="/" aria-label="One Hackney home"><div className="pm-brand"><svg width="41" height="41" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="currentColor" /><path d="M12 2v36m16-36v36M12 20h16" stroke="var(--canvas)" strokeWidth="6" /></svg><span>One <br />Hackney</span></div></Link><nav aria-label="Dashboard">{items.map(([id, label, href, path]) => <Link key={id} href={href} className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined}><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>{label}{id === "approvals" && pending !== undefined && <span className="pm-nav-count">{pending}</span>}</Link>)}</nav><div className="pm-sidebar-footer"><span>Hackney<br /><small>London Borough</small></span>{onReset ? <button className="pm-text-button" onClick={onReset} disabled={!ready}>Reset demo</button> : <small>Public reports<br />Proposed plans</small>}</div></aside>;
}
