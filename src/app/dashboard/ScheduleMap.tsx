"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { roadRoute, type RoadRoute } from "@/lib/council/roads";
import { clockTime, type Schedule } from "@/lib/dashboard/scheduler";
import { type RepairIssue } from "@/lib/dashboard/repairs";

const colours = ["#006950", "#3c80a3", "#bd7837", "#9869a1", "#be6560", "#7f8f42", "#5d719c", "#a36b83"];

export default function ScheduleMap({ schedule, issues, date, onClose, scroll = true }: { schedule: Schedule; issues: RepairIssue[]; date: string; onClose: () => void; scroll?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [routes, setRoutes] = useState<Record<string, RoadRoute>>({});
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const teams = useMemo(() => {
    const byId = new Map(issues.map(issue => [issue.id, issue]));
    const groups = new Map<string, { id: string; name: string; visits: { assignment: Schedule["assignments"][number]; lat: number | null; lon: number | null }[] }>();
    for (const assignment of schedule.assignments.filter(a => a.date === date).sort((a, b) => a.start - b.start)) {
      const issue = byId.get(assignment.issueId);
      const lat = issue?.lat ?? null, lon = issue?.lon ?? null;
      const valid = lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
      const group = groups.get(assignment.crewId) ?? { id: assignment.crewId, name: assignment.crewName, visits: [] };
      group.visits.push({ assignment, lat: valid ? lat : null, lon: valid ? lon : null });
      groups.set(assignment.crewId, group);
    }
    return Array.from(groups.values());
  }, [date, issues, schedule]);
  const total = teams.reduce((sum, team) => sum + team.visits.length, 0);
  const mapped = teams.reduce((sum, team) => sum + team.visits.filter(visit => visit.lat !== null && visit.lon !== null).length, 0);
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (scroll) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);

  useEffect(() => {
    if (!token || !container.current) return;
    const m = new mapboxgl.Map({ container: container.current, accessToken: token, style: "mapbox://styles/mapbox/light-v11", center: [-0.055, 51.545], zoom: 12 });
    mapRef.current = m;
    const map = m;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    const bounds = new mapboxgl.LngLatBounds();
    const features: GeoJSON.Feature<GeoJSON.LineString, { colour: string; team: string }>[] = [];
    teams.forEach((team, index) => {
      const colour = colours[index % colours.length];
      const coordinates: [number, number][] = [];
      team.visits.forEach(({ assignment, lat, lon }, visitIndex) => {
        if (lat === null || lon === null) return;
        coordinates.push([lon, lat]); bounds.extend([lon, lat]);
        const element = document.createElement("button");
        element.className = "ops-map-marker"; element.style.backgroundColor = colour; element.textContent = String(visitIndex + 1);
        element.setAttribute("aria-label", `${team.name}, stop ${visitIndex + 1}: ${assignment.title}`);
        const content = document.createElement("div");
        const title = document.createElement("strong"); title.textContent = assignment.title;
        const detail = document.createElement("p"); detail.textContent = `${team.name} · ${clockTime(assignment.start)}–${clockTime(assignment.end)}`;
        content.append(title, detail);
        new mapboxgl.Marker({ element }).setLngLat([lon, lat]).setPopup(new mapboxgl.Popup({ offset: 18 }).setDOMContent(content)).addTo(map);
      });
      if (coordinates.length > 1) features.push({ type: "Feature", properties: { colour, team: team.id }, geometry: { type: "LineString", coordinates } });
    });
    map.on("load", () => {
      map.addSource("visit-order", { type: "geojson", data: { type: "FeatureCollection", features } });
      map.addLayer({ id: "visit-order", type: "line", source: "visit-order", paint: { "line-color": ["get", "colour"], "line-width": 2, "line-opacity": 0.35, "line-dasharray": [2, 2] } });
      map.addSource("road-routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "road-casing", type: "line", source: "road-routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 } });
      map.addLayer({ id: "road-routes", type: "line", source: "road-routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "colour"], "line-width": 4, "line-opacity": 0.9 } });
      setLoaded(true);
      if (mapped === 1) map.flyTo({ center: bounds.getCenter(), zoom: 14, duration: 0 });
      else if (mapped > 1) map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 0 });
    });
    return () => { map.remove(); mapRef.current = null; setLoaded(false); };
  }, [mapped, teams, token]);

  // Follow real streets between each team's stops.
  useEffect(() => {
    const ctrl = new AbortController();
    setRoutes({});
    teams.forEach((team) => {
      const pts = team.visits.flatMap(({ lat, lon }) => (lat === null || lon === null ? [] : [[lon, lat] as [number, number]]));
      roadRoute(pts, ctrl.signal).then((r) => { if (r) setRoutes((prev) => ({ ...prev, [team.id]: r })); }).catch(() => {});
    });
    return () => ctrl.abort();
  }, [teams]);

  useEffect(() => {
    const src = loaded ? (mapRef.current?.getSource("road-routes") as mapboxgl.GeoJSONSource | undefined) : undefined;
    if (!src) return;
    src.setData({ type: "FeatureCollection", features: teams.flatMap((team, index) => (routes[team.id] ? [{ type: "Feature" as const, properties: { colour: colours[index % colours.length] }, geometry: routes[team.id].geometry }] : [])) });
    mapRef.current?.setPaintProperty("visit-order", "line-opacity", Object.keys(routes).length ? 0 : 0.35);
  }, [loaded, routes, teams]);

  return <section ref={panel} className="pm-card ops-team-map" aria-labelledby="team-map-heading"><div className="ops-map-header"><div><h2 id="team-map-heading">Visit plan · {label}</h2><p>Scheduled stops by team, in visit order, routed along real streets.</p></div><button type="button" className="ops-secondary" onClick={onClose}>Close map</button></div>
    <p className="ops-map-note">{mapped} of {total} visits have coordinates. Locations show planned jobs, not live crew positions.</p>
    {token ? <div ref={container} className="ops-map-canvas" aria-label={`Map of scheduled visits for ${label}`} /> : <div className="ops-map-empty">Map unavailable: a Mapbox token is needed. The visit list is still available below.</div>}
    {!total && <p className="ops-map-note">No visits are scheduled for this day.</p>}
    <div className="ops-map-visits">{teams.map((team, index) => <section key={team.id}><h3><i style={{ backgroundColor: colours[index % colours.length] }} />{team.name}{routes[team.id] && <small style={{ marginLeft: 8, fontWeight: 500, color: "var(--muted)" }}>{routes[team.id].km.toFixed(1)} km · {Math.round(routes[team.id].minutes)} min driving</small>}</h3><ol>{team.visits.map(({ assignment, lat, lon }) => <li key={assignment.issueId}><span>{clockTime(assignment.start)}–{clockTime(assignment.end)}</span><Link href={`/dashboard/repairs?search=${encodeURIComponent(assignment.issueId)}`}>{assignment.title}</Link>{lat === null || lon === null ? <small>Location unavailable on map</small> : null}</li>)}</ol></section>)}</div>
  </section>;
}
