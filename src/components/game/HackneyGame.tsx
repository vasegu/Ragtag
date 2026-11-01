"use client";

import { Component, memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, Stars } from "@react-three/drei";
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, CanvasTexture, DataTexture, MeshToonMaterial, NearestFilter, RedFormat, SRGBColorSpace } from "three";
import { CameraRig } from "./CameraRig";
import { ReportBeacons } from "./ReportBeacons";
import { loadGameMap, type GameMapData, type GameReport } from "./map-data";
import type { MeshData, SceneGeometry } from "./geometry";

export { latLngToLocal } from "./map-data";
export type { GameReport } from "./map-data";
export type HackneyGameProps = {
  reports?: GameReport[];
  focus?: { lat: number; lng: number } | null;
  /** Optional: lets the demo seed reports on the exact streets that finished loading. */
  onMapReady?: (data: GameMapData) => void;
  /** Day or night lighting. */
  theme?: GameTheme;
  /** Called with a report id when its beacon is clicked. */
  onSelect?: (id: string) => void;
};
const NO_REPORTS: GameReport[] = [];

function geometry(attributes: MeshData) {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(attributes.position, 3));
  g.setAttribute("normal", new BufferAttribute(attributes.normal, 3));
  g.setAttribute("color", new BufferAttribute(attributes.color, 3));
  g.computeBoundingSphere();
  return g;
}

function lines(position: Float32Array) {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(position, 3));
  g.computeBoundingSphere();
  return g;
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.15, "rgba(255,255,255,0.5)");
  gradient.addColorStop(0.42, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export type GameTheme = "night" | "day";

const PALETTE = {
  night: {
    skyLow: "0.075,0.105,0.18", skyHigh: "0.012,0.023,0.065", fog: "#111c31", ground: "#111b2c", bg: "#080f20",
    hemi: ["#a8b9ed", "#263c50", 2.1] as [string, string, number], sun: ["#abbcff", 2.1] as [string, number], rim: ["#66bba9", 0.5] as [string, number],
    windows: 1, outline: "#111728", stars: true, label: "#a4e4c7", labelShadow: "#001e18",
  },
  day: {
    skyLow: "0.86,0.92,0.97", skyHigh: "0.47,0.69,0.92", fog: "#cfe0ee", ground: "#c9d3c4", bg: "#cfe0ee",
    hemi: ["#ffffff", "#8fa39a", 3.2] as [string, string, number], sun: ["#fff1d6", 3.4] as [string, number], rim: ["#bfe6ff", 1.1] as [string, number],
    windows: 0, outline: "#3b4a63", stars: false, label: "#00664f", labelShadow: "#ffffff",
  },
};

const City = memo(function City({ built, data, theme }: { built: SceneGeometry; data: GameMapData; theme: GameTheme }) {
  const palette = PALETTE[theme];
  const assets = useMemo(() => {
    const gradient = new DataTexture(new Uint8Array([75, 155, 255]), 3, 1, RedFormat);
    gradient.minFilter = gradient.magFilter = NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
    const toon = new MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
    // Sparse, deterministic window light in world coordinates. No per-building materials.
    toon.userData.windows = { value: 1 };
    toon.onBeforeCompile = (shader) => {
      shader.uniforms.uWindows = toon.userData.windows;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vCityPosition;\nvarying vec3 vCityNormal;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCityPosition = position;\nvCityNormal = normal;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vCityPosition;\nvarying vec3 vCityNormal;\nuniform float uWindows;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          vec2 wall = vec2(vCityPosition.x + vCityPosition.z, vCityPosition.y);
          vec2 cell = floor(wall / vec2(4.6, 5.0));
          vec2 pane = abs(fract(wall / vec2(4.6, 5.0)) - 0.5);
          float occupied = step(0.76, fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453));
          float windowMask = (1.0 - step(0.16, pane.x)) * (1.0 - step(0.22, pane.y));
          float wallMask = 1.0 - abs(vCityNormal.y);
          totalEmissiveRadiance += vec3(0.52, 0.34, 0.13) * occupied * windowMask * wallMask * step(4.0, vCityPosition.y) * uWindows;`);
    };
    return { buildings: geometry(built.buildings), roads: geometry(built.roads), parks: geometry(built.parks), water: geometry(built.water), fields: geometry(built.fields), outlines: lines(built.outlines), fieldBorder: lines(built.fieldBorder), toon, gradient, glow: glowTexture() };
  }, [built]);

  useEffect(() => () => { Object.values(assets).forEach((asset) => asset.dispose()); }, [assets]);
  useEffect(() => { assets.toon.userData.windows.value = palette.windows; }, [assets, palette.windows]);

  const fieldsCenter = useMemo(() => {
    let x = 0, y = 0;
    for (let i = 0; i < data.londonFields.length; i += 2) { x += data.londonFields[i]; y += data.londonFields[i + 1]; }
    const n = Math.max(1, data.londonFields.length / 2);
    return [x / n, -y / n] as const;
  }, [data.londonFields]);

  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
      <planeGeometry args={[32000, 32000]} />
      <meshStandardMaterial color={palette.ground} roughness={1} />
    </mesh>
    <mesh geometry={assets.parks}><meshStandardMaterial vertexColors roughness={1} emissive="#00664f" emissiveIntensity={0.18} /></mesh>
    <mesh geometry={assets.roads}><meshBasicMaterial vertexColors transparent opacity={0.62} /></mesh>
    <mesh geometry={assets.water}><meshPhysicalMaterial vertexColors metalness={0.55} roughness={0.2} clearcoat={0.8} emissive="#07353b" emissiveIntensity={0.32} /></mesh>
    <mesh geometry={assets.fields}><meshStandardMaterial vertexColors emissive="#00b37f" emissiveIntensity={0.28} roughness={0.9} /></mesh>
    <mesh position={[fieldsCenter[0], 6, fieldsCenter[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[720, 1000]} />
      <meshBasicMaterial map={assets.glow} color="#00b884" transparent opacity={0.3} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
    <lineSegments geometry={assets.fieldBorder}><lineBasicMaterial color="#50d9a5" transparent opacity={0.65} /></lineSegments>
    <mesh geometry={assets.buildings} material={assets.toon} />
    <lineSegments geometry={assets.outlines}><lineBasicMaterial color={palette.outline} transparent opacity={theme === "day" ? 0.35 : 0.55} /></lineSegments>
    <Html position={[fieldsCenter[0], 9, fieldsCenter[1]]} center style={{ pointerEvents: "none" }} zIndexRange={[2, 0]}>
      <div style={{ color: palette.label, fontFamily: "var(--font-geist-mono), monospace", fontSize: 10, letterSpacing: "0.2em", whiteSpace: "nowrap", textShadow: `0 2px 8px ${palette.labelShadow}`, transform: "translateY(-10px)" }}>LONDON FIELDS</div>
    </Html>
  </group>;
});

function Sky({ theme }: { theme: GameTheme }) {
  const palette = PALETTE[theme];
  const uniforms = useMemo(() => ({}), []);
  return <>
    <mesh>
      <sphereGeometry args={[22000, 24, 16]} />
      <shaderMaterial side={BackSide} depthWrite={false} uniforms={uniforms} vertexShader="varying vec3 vSky; void main() { vSky = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }" key={theme} fragmentShader={`varying vec3 vSky; void main() { float h = smoothstep(-0.1, 0.6, normalize(vSky).y); gl_FragColor = vec4(mix(vec3(${palette.skyLow}), vec3(${palette.skyHigh}), h),1.0); }`} />
    </mesh>
    {palette.stars && <Stars radius={15000} depth={4000} count={1700} factor={6} saturation={0.15} fade speed={0} />}
  </>;
}

function Scene({ data, built, reports, focus, reducedMotion, theme, onSelect }: { data: GameMapData; built: SceneGeometry; reports: GameReport[]; focus: HackneyGameProps["focus"]; reducedMotion: boolean; theme: GameTheme; onSelect?: (id: string) => void }) {
  const palette = PALETTE[theme];
  const glow = useMemo(glowTexture, []);
  useEffect(() => () => glow.dispose(), [glow]);
  return <>
    <fog attach="fog" args={[palette.fog, 3200, 10500]} />
    <Sky theme={theme} />
    <hemisphereLight args={palette.hemi} />
    <directionalLight position={[-1800, 3000, 1200]} color={palette.sun[0]} intensity={palette.sun[1]} />
    <directionalLight position={[1200, 900, -1500]} color={palette.rim[0]} intensity={palette.rim[1]} />
    <City built={built} data={data} theme={theme} />
    <ReportBeacons reports={reports} origin={data.origin} glow={glow} reducedMotion={reducedMotion} onSelect={onSelect} />
    <CameraRig focus={focus} origin={data.origin} reducedMotion={reducedMotion} />
  </>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" className="game-load-state">The 3D view could not start. Enable WebGL and reload this page.</div>;
    return this.props.children;
  }
}

export default function HackneyGame({ reports = NO_REPORTS, focus = null, onMapReady, theme = "night", onSelect }: HackneyGameProps) {
  const [loaded, setLoaded] = useState<{ data: GameMapData; built: SceneGeometry } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (loaded) onMapReady?.(loaded.data);
  }, [loaded, onMapReady]);

  useEffect(() => {
    let active = true;
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    loadGameMap(attempt > 0).then((data) => {
      if (!active) return;
      worker = new Worker(new URL("./geometry.worker.ts", import.meta.url));
      timeout = setTimeout(() => { worker?.terminate(); if (active) setError("Preparing the 3D map took too long. Please try again."); }, 45000);
      worker.onmessage = (event: MessageEvent<{ geometry?: SceneGeometry; error?: string }>) => {
        clearTimeout(timeout);
        worker?.terminate();
        if (!active) return;
        if (event.data.geometry) setLoaded({ data, built: event.data.geometry });
        else setError(event.data.error ?? "The map could not be prepared.");
      };
      worker.onerror = () => { clearTimeout(timeout); worker?.terminate(); if (active) setError("The map worker could not start. Please try again."); };
      worker.postMessage(data);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "The map could not be downloaded."); });
    return () => { active = false; clearTimeout(timeout); worker?.terminate(); };
  }, [attempt]);

  return <div style={{ position: "absolute", inset: 0, background: PALETTE[theme].bg, transition: "background 400ms" }}>
    {loaded ? <SceneBoundary>
      <Canvas camera={{ position: [3100, 5800, 5300], fov: 42, near: 10, far: 30000 }} dpr={[1, 1.25]} gl={{ antialias: true, alpha: false, powerPreference: "high-performance", logarithmicDepthBuffer: true }} fallback={<div className="game-load-state" role="alert">This map needs a browser with WebGL enabled.</div>}>
        <Scene data={loaded.data} built={loaded.built} reports={reports} focus={focus} reducedMotion={reducedMotion} theme={theme} onSelect={onSelect} />
      </Canvas>
    </SceneBoundary> : <div className="game-load-state" role={error ? "alert" : "status"}>
      <span className="game-loading-mark" aria-hidden="true">✦</span>
      <span>{error ?? "Lighting up Hackney…"}</span>
      {error ? <button onClick={() => { setError(null); setAttempt((n) => n + 1); }}>Try again</button> : <span className="game-loading-detail">Preparing the neighbourhood</span>}
    </div>}
    {loaded ? <div className="game-attribution">{loaded.data.source === "procedural" ? "Procedural fallback · illustrative geography" : <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>}</div> : null}
  </div>;
}
