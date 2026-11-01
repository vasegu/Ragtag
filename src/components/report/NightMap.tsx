"use client";

import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import { CATEGORY_META, type LatLng, type Report } from "@/lib/report/types";

// Start close over London Fields: Mapbox only draws 3D buildings and landmarks from about zoom 15.
const START_CENTER: [number, number] = [-0.0612, 51.5418];

type Props = {
  reports: Report[];
  /** Fly the camera here (e.g. the spot being reported). */
  focus: LatLng | null;
  /** A just-submitted report, shown as a big pulsing beacon. */
  dropped: (LatLng & { category: Report["category"] }) | null;
  /** Report ids to ring as "still there?" quests. */
  questIds: string[];
  onSelect?: (report: Report) => void;
  theme: "night" | "day";
};

function toGeoJSON(reports: Report[], questIds: string[]): GeoJSON.FeatureCollection {
  const quests = new Set(questIds);
  return {
    type: "FeatureCollection",
    features: reports.map((r) => ({
      type: "Feature",
      id: r.id,
      geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id,
        colour: r.status === "fixed" ? "#d9f2e6" : CATEGORY_META[r.category].colour,
        status: r.status,
        quest: quests.has(r.id),
      },
    })),
  };
}

/** Mapbox Standard style at night: 3D buildings and landmarks, glowing report pins. */
export function NightMap({ reports, focus, dropped, questIds, onSelect, theme }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const idleSpin = useRef(true);
  // The style loads with the starting light; later changes go through setConfigProperty.
  const initialTheme = useRef(theme);
  const latest = useRef({ reports, questIds, onSelect });
  latest.current = { reports, questIds, onSelect };

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
      style: "mapbox://styles/mapbox/standard",
      config: {
        basemap: {
          lightPreset: initialTheme.current,
          show3dObjects: true,
          showPointOfInterestLabels: false,
          showTransitLabels: false,
          showPedestrianRoads: false,
        },
      },
      center: START_CENTER,
      zoom: 15.6,
      pitch: 66,
      bearing: -24,
      antialias: true,
      attributionControl: false,
    });
    map.current = m;
    m.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    m.on("style.load", () => {
      m.addSource("reports", { type: "geojson", data: toGeoJSON(latest.current.reports, latest.current.questIds) });
      // Soft halo, then a bright core; emissive so they glow under the night lighting.
      m.addLayer({
        id: "report-halo",
        type: "circle",
        source: "reports",
        slot: "top",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 10, 17, 34],
          "circle-color": ["get", "colour"],
          "circle-opacity": ["case", ["==", ["get", "status"], "fixed"], 0.18, 0.4],
          "circle-blur": 0.9,
          "circle-emissive-strength": 1,
          "circle-pitch-alignment": "map",
        },
      });
      m.addLayer({
        id: "report-quest",
        type: "circle",
        source: "reports",
        slot: "top",
        filter: ["==", ["get", "quest"], true],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 8, 17, 20],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#a4d65e",
          "circle-stroke-width": 2,
          "circle-emissive-strength": 1,
          "circle-pitch-alignment": "map",
        },
      });
      m.addLayer({
        id: "report-core",
        type: "circle",
        source: "reports",
        slot: "top",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 5.5, 17, 14],
          "circle-color": ["get", "colour"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 17, 3],
          "circle-emissive-strength": 1,
          "circle-pitch-alignment": "map",
        },
      });
      // Pins are small, so accept clicks within ~12px of one.
      const pinAt = (p: mapboxgl.Point) =>
        m.queryRenderedFeatures(
          [
            [p.x - 12, p.y - 12],
            [p.x + 12, p.y + 12],
          ],
          { layers: ["report-core", "report-halo"] },
        )[0];
      m.on("click", (e) => {
        const id = pinAt(e.point)?.properties?.id;
        const report = latest.current.reports.find((r) => r.id === id);
        if (report) latest.current.onSelect?.(report);
      });
      m.on("mousemove", (e) => (m.getCanvas().style.cursor = pinAt(e.point) ? "pointer" : ""));
    });

    // Slow orbit while idle, like a game's attract mode. Stops on interaction.
    const stop = () => (idleSpin.current = false);
    // Stop as soon as the pointer is over the map, so pins hold still to be clicked.
    m.on("mousemove", stop);
    m.on("mousedown", stop);
    m.on("touchstart", stop);
    m.on("wheel", stop);
    const spin = () => {
      if (!idleSpin.current || !map.current) return;
      m.easeTo({ bearing: m.getBearing() + 6, duration: 4000, easing: (t) => t });
    };
    m.on("moveend", spin);
    m.once("idle", spin);

    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (m?.isStyleLoaded()) m.setConfigProperty("basemap", "lightPreset", theme);
  }, [theme]);

  useEffect(() => {
    const source = map.current?.getSource("reports") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(toGeoJSON(reports, questIds));
  }, [reports, questIds]);

  useEffect(() => {
    if (!focus || !map.current) return;
    idleSpin.current = false;
    map.current.flyTo({
      center: [focus.lng, focus.lat],
      zoom: 17.3,
      pitch: 72,
      bearing: map.current.getBearing() + 40,
      duration: 4200,
      curve: 1.6,
      essential: true,
    });
  }, [focus]);

  useEffect(() => {
    marker.current?.remove();
    marker.current = null;
    if (!dropped || !map.current) return;
    const el = document.createElement("div");
    el.className = "beacon";
    el.style.setProperty("--beacon", CATEGORY_META[dropped.category].colour);
    el.innerHTML = '<span class="beacon-ring"></span><span class="beacon-ring delay"></span><span class="beacon-core"></span>';
    marker.current = new mapboxgl.Marker({ element: el, pitchAlignment: "map" }).setLngLat([dropped.lng, dropped.lat]).addTo(map.current);
  }, [dropped]);

  // Mapbox sets `position: relative` on its container, so it needs an explicitly sized parent.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}
