"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { clockTime, type Schedule } from "@/lib/dashboard/scheduler";
import { type RepairIssue } from "@/lib/dashboard/repairs";

type Shift = "all" | "day" | "night";
const colours = ["#006950", "#3c80a3", "#bd7837", "#9869a1", "#be6560", "#7f8f42", "#5d719c", "#a36b83"];

export default function ScheduleMap({ schedule, issues }: { schedule: Schedule; issues: RepairIssue[] }) {
  const [shift, setShift] = useState<Shift>("all");
  const [team, setTeam] = useState("all");
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const teams = useMemo(() => Array.from(new Set(schedule.assignments.map(a => a.crewName))).sort(), [schedule]);
  const locations = useMemo(() => {
    const byId = new Map(issues.map(issue => [issue.id, issue]));
    return schedule.assignments.filter(a => (team === "all" || a.crewName === team) && (shift === "all" || (shift === "day" ? a.start >= 360 && a.start < 1080 : a.start < 360 || a.start >= 1080))).flatMap(assignment => {
      const issue = byId.get(assignment.issueId);
      return issue && issue.lat !== null && issue.lon !== null && Number.isFinite(issue.lat) && Number.isFinite(issue.lon) && Math.abs(issue.lat) <= 90 && Math.abs(issue.lon) <= 180 ? [{ assignment, lat: issue.lat, lon: issue.lon }] : [];
    });
  }, [issues, schedule, shift, team]);
  const matchingCount = schedule.assignments.filter(a => (team === "all" || a.crewName === team) && (shift === "all" || (shift === "day" ? a.start >= 360 && a.start < 1080 : a.start < 360 || a.start >= 1080))).length;

  useEffect(() => {
    if (!token || !container.current) return;
    const instance = new mapboxgl.Map({ container: container.current, accessToken: token, style: "mapbox://styles/mapbox/light-v11", center: [-0.055, 51.545], zoom: 12 });
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.current = instance;
    return () => { markers.current.forEach(marker => marker.remove()); markers.current = []; map.current = null; instance.remove(); };
  }, [token]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    markers.current.forEach(marker => marker.remove());
    markers.current = locations.map(({ assignment, lat, lon }) => {
      const element = document.createElement("button");
      element.className = "ops-map-marker";
      element.style.backgroundColor = colours[teams.indexOf(assignment.crewName) % colours.length];
      element.setAttribute("aria-label", `${assignment.crewName}: ${assignment.title}`);
      const content = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = assignment.title;
      const detail = document.createElement("p"); detail.textContent = `${assignment.crewName} · ${assignment.date} · ${clockTime(assignment.start)}–${clockTime(assignment.end)}`;
      content.append(title, detail);
      return new mapboxgl.Marker({ element }).setLngLat([lon, lat]).setPopup(new mapboxgl.Popup({ offset: 18 }).setDOMContent(content)).addTo(instance);
    });
  }, [locations, teams, token]);

  return <section className="pm-card ops-team-map" aria-labelledby="team-map-heading"><div className="ops-map-header"><div><h2 id="team-map-heading">Teams across Hackney</h2><p>Proposed visit locations, not live team positions. Day: 06:00–17:59 · Night: 18:00–05:59.</p></div><div className="ops-map-filters"><label>Shift <select value={shift} onChange={e => { const value = e.target.value; if (value === "all" || value === "day" || value === "night") setShift(value); }}><option value="all">All shifts</option><option value="day">Day</option><option value="night">Night</option></select></label><label>Team <select value={team} onChange={e => setTeam(e.target.value)}><option value="all">All teams</option>{teams.map(name => <option key={name} value={name}>{name}</option>)}</select></label></div></div>
    <p className="ops-map-note">{locations.length} of {matchingCount} proposed visits have coordinates. Shift labels are based on visit start times; the current scheduler cannot plan overnight shifts.</p>
    {token ? <div ref={container} className="ops-map-canvas" aria-label="Map of proposed team visit locations" /> : <div className="ops-map-empty">Map unavailable: a Mapbox token is needed. Scheduled visits are listed below.</div>}
    {!matchingCount && <p className="ops-map-note">No proposed visits for this selection.</p>}
    <div className="ops-map-legend" aria-label="Team colours">{teams.filter(name => team === "all" || team === name).map(name => <span key={name}><i style={{ backgroundColor: colours[teams.indexOf(name) % colours.length] }} />{name}</span>)}</div>
  </section>;
}
