"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import { CATEGORY_META } from "@/lib/report/types";
import { DEPOT, clock, type DayPlan } from "@/lib/council/plan";

type Props = {
  plan: DayPlan;
  selectedCrew: string | null;
  /** Job to fly to; `nonce` lets the same stop be focused twice. */
  focus: { jobId: string; nonce: number } | null;
  onPickStop: (crewId: string, jobId: string) => void;
};

function routes(plan: DayPlan): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: plan.crews
      .filter((c) => c.stops.length)
      .map((c) => ({
        type: "Feature",
        properties: { crew: c.id, colour: c.colour },
        geometry: {
          type: "LineString",
          coordinates: [[DEPOT.lng, DEPOT.lat], ...c.stops.map((s) => [s.job.lng, s.job.lat]), [DEPOT.lng, DEPOT.lat]],
        },
      })),
  };
}

function stops(plan: DayPlan): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: plan.crews.flatMap((c) =>
      c.stops.map((s) => ({
        type: "Feature" as const,
        properties: { crew: c.id, job: s.job.id, n: s.n, colour: c.colour },
        geometry: { type: "Point" as const, coordinates: [s.job.lng, s.job.lat] },
      })),
    ),
  };
}

function overflow(plan: DayPlan): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: plan.overflow.map((j) => ({
      type: "Feature",
      properties: { job: j.id },
      geometry: { type: "Point", coordinates: [j.lng, j.lat] },
    })),
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Light Mapbox map: one coloured line per crew from the depot and back, numbered stops, grey jobs left for tomorrow. */
export function RouteMap({ plan, selectedCrew, focus, onPickStop }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const popup = useRef<mapboxgl.Popup | null>(null);
  const latest = useRef({ plan, onPickStop });
  latest.current = { plan, onPickStop };
  const ready = useRef(false);

  useEffect(() => {
    if (!container.current || map.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.warn("NEXT_PUBLIC_MAPBOX_TOKEN is not set; the map is disabled.");
      return;
    }
    mapboxgl.accessToken = token;
    const m = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [-0.06, 51.548],
      zoom: 12.6,
      attributionControl: false,
    });
    map.current = m;
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    m.on("load", () => {
      const p = latest.current.plan;
      m.addSource("routes", { type: "geojson", data: routes(p) });
      m.addSource("stops", { type: "geojson", data: stops(p) });
      m.addSource("overflow", { type: "geojson", data: overflow(p) });
      m.addLayer({
        id: "overflow",
        type: "circle",
        source: "overflow",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 16, 6],
          "circle-color": "#ffffff",
          "circle-stroke-color": "#a3a39c",
          "circle-stroke-width": 1.5,
        },
      });
      m.addLayer({
        id: "route-casing",
        type: "line",
        source: "routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 9] },
      });
      m.addLayer({
        id: "route",
        type: "line",
        source: "routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "colour"], "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 16, 5] },
      });
      m.addLayer({
        id: "stop",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 5, 16, 11],
          "circle-color": ["get", "colour"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
      m.addLayer({
        id: "stop-n",
        type: "symbol",
        source: "stops",
        minzoom: 12.5,
        layout: {
          "text-field": ["to-string", ["get", "n"]],
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12.5, 8, 16, 12],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": "#ffffff" },
      });

      const depot = document.createElement("div");
      depot.className = "grid h-8 w-8 place-items-center rounded-[10px] bg-hackney text-white shadow-card-hover ring-2 ring-white";
      depot.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 5l9 5.5V20H3z"/><path d="M8 20v-5h8v5"/></svg>';
      depot.title = "Millfields depot";
      new mapboxgl.Marker({ element: depot }).setLngLat([DEPOT.lng, DEPOT.lat]).addTo(m);

      // Frame every open job.
      const pts = [...p.crews.flatMap((c) => c.stops.map((s) => s.job)), ...p.overflow];
      if (pts.length) {
        const b = new mapboxgl.LngLatBounds([DEPOT.lng, DEPOT.lat], [DEPOT.lng, DEPOT.lat]);
        pts.forEach((j) => b.extend([j.lng, j.lat]));
        m.fitBounds(b, { padding: 48, duration: 0, maxZoom: 14 });
      }

      m.on("click", "stop", (e) => {
        const f = e.features?.[0];
        if (f?.properties) latest.current.onPickStop(String(f.properties.crew), String(f.properties.job));
      });
      m.on("mouseenter", "stop", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "stop", () => (m.getCanvas().style.cursor = ""));
      ready.current = true;
    });

    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  // Re-plan: swap the data in place.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource("routes") as mapboxgl.GeoJSONSource | undefined)?.setData(routes(plan));
    (m.getSource("stops") as mapboxgl.GeoJSONSource | undefined)?.setData(stops(plan));
    (m.getSource("overflow") as mapboxgl.GeoJSONSource | undefined)?.setData(overflow(plan));
  }, [plan]);

  // Selected crew: full colour; everyone else fades back.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const on: mapboxgl.ExpressionSpecification | number = selectedCrew ? ["case", ["==", ["get", "crew"], selectedCrew], 1, 0.14] : 1;
      m.setPaintProperty("route", "line-opacity", on);
      m.setPaintProperty("route-casing", "line-opacity", on);
      m.setPaintProperty("stop", "circle-opacity", on);
      m.setPaintProperty("stop", "circle-stroke-opacity", on);
      m.setPaintProperty("stop-n", "text-opacity", on);
      m.setPaintProperty("overflow", "circle-opacity", selectedCrew ? 0.3 : 1);
      m.setPaintProperty("overflow", "circle-stroke-opacity", selectedCrew ? 0.3 : 1);
    };
    if (ready.current) apply();
    else m.once("load", apply);
  }, [selectedCrew]);

  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    const crew = plan.crews.find((c) => c.stops.some((s) => s.job.id === focus.jobId));
    const stop = crew?.stops.find((s) => s.job.id === focus.jobId);
    if (!crew || !stop) return;
    m.flyTo({ center: [stop.job.lng, stop.job.lat], zoom: Math.max(m.getZoom(), 15.5), duration: 900, essential: true });
    popup.current?.remove();
    const meta = CATEGORY_META[stop.job.category];
    popup.current = new mapboxgl.Popup({ offset: 14, closeButton: false, maxWidth: "260px" })
      .setLngLat([stop.job.lng, stop.job.lat])
      .setHTML(
        `<div style="font-family:var(--font-open-sans);color:#141414">
          <div style="font-family:var(--font-geist-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${crew.colour}">${esc(crew.label)} · stop ${stop.n}</div>
          <div style="margin-top:4px;font-size:13px;font-weight:600;line-height:1.3">${esc(stop.job.title)}</div>
          <div style="margin-top:4px;font-size:12px;color:#74746e">${meta.label} · ${clock(stop.arrive)}–${clock(stop.depart)} · ${stop.job.severity}</div>
        </div>`,
      )
      .addTo(m);
    // Only on focus changes; the plan is read for the stop's details.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return <div ref={container} className="h-full w-full" />;
}
