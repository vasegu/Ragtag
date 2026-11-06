"use client";
import Link from "next/link";
import WorkspaceNav from "./WorkspaceNav";
import RepairsList from "./RepairsList";
import ScheduleView from "./ScheduleView";
import { useRepairs } from "./useRepairs";

export default function RepairsWorkspace({ tab }: { tab: "repairs" | "schedule" }) {
  const data = useRepairs();
  return <div className="pm-dashboard pm-operations"><a href="#operations-content" className="pm-skip">Skip to workspace</a><WorkspaceNav active={tab} /><main className="pm-content" id="operations-content"><header className="pm-header"><div><h1>{tab === "repairs" ? "Repairs" : "Repair schedule"}</h1><p>Public reports <span className="pm-header-divider">/</span> {tab === "repairs" ? "Priority and evidence" : "Proposed resource allocation"}</p></div><div className="ops-header-actions"><button className="ops-secondary" disabled={data.loading} onClick={data.refresh}>{data.loading ? "Loading…" : "Refresh reports"}</button><Link className="pm-button" href={tab === "repairs" ? "/dashboard/schedule" : "/dashboard/repairs"}>{tab === "repairs" ? "Open scheduler" : "View repairs"}</Link></div></header>
    <div className="ops-source"><span><i />{data.loading ? `${data.issues.length} public records loaded…` : `${data.issues.filter(i => i.source === "FixMyStreet").length} reports · ${data.issues.filter(i => i.source === "Public work order").length} AI work orders, including those referred elsewhere`}</span><span>Resource scenarios and planning edits stay in this browser</span></div>
    {data.error && <div className="ops-error" role="alert">{data.error} <button onClick={data.refresh}>Retry</button></div>}{data.warning && <div className="ops-warning" role="status">{data.warning}</div>}{data.notice && <div className="pm-notices" role="status">{data.notice}<button className="pm-text-button" onClick={() => data.setNotice("")}>Dismiss</button></div>}
    {tab === "repairs" ? <RepairsList data={data} /> : <ScheduleView data={data} />}
    <footer className="pm-page-footer">Source statuses and original dates are preserved · Proposed schedules do not dispatch crews</footer></main></div>;
}
