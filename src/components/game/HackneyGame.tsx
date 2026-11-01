"use client";

import { Component, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, Stars } from "@react-three/drei";
import { AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DataTexture, Euler, IcosahedronGeometry, type InstancedMesh, LinearFilter, Matrix4, MeshToonMaterial, Quaternion, RedFormat, SRGBColorSpace, Vector3 } from "three";
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

function geometry(attributes: MeshData & { detail?: Float32Array }) {
  const g = new BufferGeometry();
  if (attributes.detail) g.setAttribute("detail", new BufferAttribute(attributes.detail, 3));
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
    skyLow: "0.075,0.105,0.18", skyHigh: "0.012,0.023,0.065", fog: "#111c31", ground: "#141c2a", bg: "#080f20",
    hemi: ["#b4bde6", "#3a3346", 2.0] as [string, string, number], sun: ["#b3c1ff", 1.7] as [string, number], rim: ["#e0a878", 0.45] as [string, number],
    road: "#3a475c", roadOpacity: 0.7, park: "#1f4d3d",
    windows: 1, outline: "#0d1220", stars: true, label: "#a4e4c7", labelShadow: "#001e18",
  },
  day: {
    skyLow: "0.86,0.92,0.97", skyHigh: "0.47,0.69,0.92", fog: "#d8e2ea", ground: "#b9b4a7", bg: "#f3f3f0",
    hemi: ["#fffaf0", "#7d776c", 1.15] as [string, string, number], sun: ["#ffe9c9", 1.9] as [string, number], rim: ["#bfe6ff", 0.6] as [string, number],
    road: "#6f6e6b", roadOpacity: 0.85, park: "#86b86c",
    windows: 0, outline: "#4a3a33", stars: false, label: "#00664f", labelShadow: "#ffffff",
  },
};

const TREE_STRIDE = 5;
/** Street and park trees: two instanced draws (canopies, trunks) for the whole borough. */
function Trees({ trees, canopy, trunk, material }: { trees: Float32Array; canopy: BufferGeometry; trunk: BufferGeometry; material: MeshToonMaterial }) {
  const canopies = useRef<InstancedMesh>(null), trunks = useRef<InstancedMesh>(null);
  const count = trees.length / TREE_STRIDE;
  useLayoutEffect(() => {
    if (!canopies.current || !trunks.current) return;
    const matrix = new Matrix4(), rotation = new Quaternion(), euler = new Euler(), position = new Vector3(), scale = new Vector3(), color = new Color(), bark = new Color("#5b4636");
    for (let i = 0; i < count; i++) {
      const [x, z, size, tint, park] = trees.subarray(i * TREE_STRIDE, i * TREE_STRIDE + TREE_STRIDE);
      const s = size * (park ? 1.15 : 1);
      rotation.setFromEuler(euler.set(0, tint * Math.PI * 2, 0));
      position.set(x, 9 * s, z);
      scale.set(6 * s, 6.8 * s, 6 * s);
      canopies.current.setMatrixAt(i, matrix.compose(position, rotation, scale));
      canopies.current.setColorAt(i, color.setHSL(0.29 + tint * 0.06, 0.5 + tint * 0.15, 0.2 + tint * 0.1));
      position.set(x, 2.6 * s, z);
      scale.set(0.7 * s, 5.2 * s, 0.7 * s);
      trunks.current.setMatrixAt(i, matrix.compose(position, rotation, scale));
      trunks.current.setColorAt(i, bark);
    }
    for (const mesh of [canopies.current, trunks.current]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [trees, count]);
  if (!count) return null;
  return <>
    <instancedMesh key={`canopy-${count}`} ref={canopies} args={[canopy, material, count]} />
    <instancedMesh key={`trunk-${count}`} ref={trunks} args={[trunk, material, count]} />
  </>;
}

const City = memo(function City({ built, data, theme }: { built: SceneGeometry; data: GameMapData; theme: GameTheme }) {
  const palette = PALETTE[theme];
  const assets = useMemo(() => {
    // Four soft steps, linearly blended: cel-shaded but without hard bands.
    const gradient = new DataTexture(new Uint8Array([95, 150, 205, 255]), 4, 1, RedFormat);
    gradient.minFilter = gradient.magFilter = LinearFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
    const toon = new MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
    // Brick detailing in the shader: sash windows, a stucco cornice, a darker plinth and
    // light catching the corners (reads as rounded edges). Sparse warm window light at night.
    toon.userData.windows = { value: 1 };
    toon.onBeforeCompile = (shader) => {
      shader.uniforms.uWindows = toon.userData.windows;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 detail;\nvarying vec3 vCityPosition;\nvarying vec3 vCityNormal;\nvarying vec3 vDetail;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCityPosition = position;\nvCityNormal = normal;\nvDetail = detail;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vCityPosition;\nvarying vec3 vCityNormal;\nvarying vec3 vDetail;\nuniform float uWindows;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float wallMask = 1.0 - abs(vCityNormal.y);
          float y = vCityPosition.y, top = vDetail.z;
          vec2 wall = vec2(vDetail.x, y);
          vec2 cell = floor(wall / vec2(4.6, 5.0));
          vec2 pane = abs(fract(wall / vec2(4.6, 5.0)) - 0.5);
          float windowMask = (1.0 - step(0.16, pane.x)) * (1.0 - step(0.22, pane.y)) * step(4.0, y) * step(y, top - 2.2) * step(2.5, vDetail.y) * wallMask;
          // Fade the window grid where it gets smaller than a pixel to avoid shimmer.
          vec2 fw = fwidth(wall / vec2(4.6, 5.0));
          float near = 1.0 - smoothstep(0.18, 0.45, max(fw.x, fw.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.15, 0.19), windowMask * near * 0.8);
          float cornice = (1.0 - smoothstep(0.5, 1.0, top - y)) * wallMask;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.89, 0.82), cornice * 0.75);
          diffuseColor.rgb *= mix(0.68, 1.0, smoothstep(0.0, 6.0, y) * wallMask + abs(vCityNormal.y));
          float corner = 1.0 - smoothstep(0.0, 1.6, min(vDetail.x, vDetail.y - vDetail.x));
          diffuseColor.rgb *= 1.0 + corner * wallMask * 0.18;`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float occupied = step(0.72, fract(sin(dot(cell + vec2(vDetail.y, top), vec2(12.9898, 78.233))) * 43758.5453));
          totalEmissiveRadiance += vec3(0.62, 0.40, 0.15) * occupied * windowMask * uWindows;`);
    };
    // Trees: one rounded, slightly lumpy canopy and one trunk, each a single instanced draw.
    const canopy = new IcosahedronGeometry(1, 1);
    const p = canopy.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new Vector3().fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453;
      v.multiplyScalar(0.9 + (n - Math.floor(n)) * 0.2);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    const trunk = new CylinderGeometry(0.7, 1, 1, 5, 1, true);
    const treeToon = new MeshToonMaterial({ gradientMap: gradient });
    return { buildings: geometry(built.buildings), roads: geometry(built.roads), parks: geometry(built.parks), water: geometry(built.water), fields: geometry(built.fields), outlines: lines(built.outlines), fieldBorder: lines(built.fieldBorder), toon, gradient, glow: glowTexture(), canopy, trunk, treeToon };
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
    <mesh geometry={assets.parks}><meshStandardMaterial vertexColors color={palette.park} roughness={1} emissive={palette.park} emissiveIntensity={0.15} /></mesh>
    <mesh geometry={assets.roads}><meshBasicMaterial vertexColors color={palette.road} transparent opacity={palette.roadOpacity} /></mesh>
    <mesh geometry={assets.water}><meshPhysicalMaterial vertexColors metalness={0.55} roughness={0.2} clearcoat={0.8} emissive="#07353b" emissiveIntensity={0.32} /></mesh>
    <mesh geometry={assets.fields}><meshStandardMaterial vertexColors emissive="#00b37f" emissiveIntensity={0.28} roughness={0.9} /></mesh>
    <mesh position={[fieldsCenter[0], 6, fieldsCenter[1]]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[720, 1000]} />
      <meshBasicMaterial map={assets.glow} color="#00b884" transparent opacity={0.3} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
    <lineSegments geometry={assets.fieldBorder}><lineBasicMaterial color="#50d9a5" transparent opacity={0.65} /></lineSegments>
    <mesh geometry={assets.buildings} material={assets.toon} />
    <lineSegments geometry={assets.outlines}><lineBasicMaterial color={palette.outline} transparent opacity={theme === "day" ? 0.22 : 0.4} /></lineSegments>
    <Trees trees={built.trees} canopy={assets.canopy} trunk={assets.trunk} material={assets.treeToon} />
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
    <ReportBeacons reports={reports} origin={data.origin} glow={glow} reducedMotion={reducedMotion} onSelect={onSelect} day={theme === "day"} />
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
      <svg className="game-loading-mark" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 3c.7 4.5 2.5 6.3 7 7-4.5.7-6.3 2.5-7 7-.7-4.5-2.5-6.3-7-7 4.5-.7 6.3-2.5 7-7z" /></svg>
      <span>{error ?? "Lighting up Hackney…"}</span>
      {error ? <button onClick={() => { setError(null); setAttempt((n) => n + 1); }}>Try again</button> : <span className="game-loading-detail">Preparing the neighbourhood</span>}
    </div>}
    {loaded ? <div className="game-attribution">{loaded.data.source === "procedural" ? "Procedural fallback · illustrative geography" : <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>}</div> : null}
  </div>;
}
