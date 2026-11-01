"use client";

import { Float } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LONDON_FIELDS } from "./londonFields";

export type MascotKind = "fox" | "fields";
export type MascotMood = "idle" | "scanning" | "happy" | "sleeping" | "listening" | "talking";
type Level = { current: number };

// In the style of Grok's bots and OpenAI's dots: one simple glossy shape, a face that is
// only two capsule eyes, and all the emotion in eye shape, blink and bounce.

function glossy(colour: string) {
  return new THREE.MeshPhysicalMaterial({
    color: colour,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
    sheen: 0.4,
    sheenColor: new THREE.Color("#ffffff"),
  });
}

const eyeMaterial = new THREE.MeshPhysicalMaterial({ color: "#14161a", roughness: 0.2, clearcoat: 1 });

function Eyes({ mood, level, spacing = 0.26, z = 0.86, y = 0.08, size = 1 }: { mood: MascotMood; level?: Level; spacing?: number; z?: number; y?: number; size?: number }) {
  const group = useRef<THREE.Group>(null);
  const blink = useRef({ next: 2 + Math.random() * 2, t: 0 });

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const time = state.clock.elapsedTime;
    let open = 1;
    if (mood === "sleeping") open = 0.12;
    else if (mood === "happy") open = 0.35;
    else {
      blink.current.t += dt;
      if (blink.current.t > blink.current.next) {
        const p = (blink.current.t - blink.current.next) / 0.16;
        open = p < 1 ? Math.abs(1 - 2 * p) : 1;
        if (p >= 1) {
          blink.current.t = 0;
          blink.current.next = 1.8 + Math.random() * 2.5;
        }
      }
    }
    // Talking: eyes widen with the voice.
    if (mood === "talking" && level) open *= 1 + level.current * 0.6;
    g.children.forEach((eye) => (eye.scale.y = THREE.MathUtils.lerp(eye.scale.y, open, 0.35)));
    // Scanning: eyes sweep side to side, reading the photo.
    const look = mood === "scanning" ? Math.sin(time * 3.2) * 0.09 : 0;
    g.position.x = THREE.MathUtils.lerp(g.position.x, look, 0.2);
  });

  return (
    <group ref={group} position={[0, y, z]} scale={size}>
      {[-spacing, spacing].map((x) => (
        <mesh key={x} position={[x, 0, 0]} material={eyeMaterial}>
          <capsuleGeometry args={[0.075, 0.16, 8, 16]} />
        </mesh>
      ))}
    </group>
  );
}

function Fox({ mood, level }: { mood: MascotMood; level?: Level }) {
  const body = useMemo(() => glossy("#f08a24"), []);
  const belly = useMemo(() => glossy("#fff3e6"), []);
  const ear = useMemo(() => glossy("#e2741a"), []);
  return (
    <group>
      <mesh material={body} scale={[1, 0.92, 0.94]}>
        <sphereGeometry args={[1, 64, 64]} />
      </mesh>
      <mesh material={belly} position={[0, -0.32, 0.6]} scale={[0.62, 0.48, 0.42]}>
        <sphereGeometry args={[1, 48, 48]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={ear} position={[s * 0.52, 0.86, -0.05]} rotation={[0, 0, -s * 0.38]}>
          <coneGeometry args={[0.26, 0.5, 32]} />
        </mesh>
      ))}
      <mesh material={body} position={[0.95, -0.55, -0.45]} rotation={[0.3, 0.4, -0.9]} scale={[0.3, 0.62, 0.3]}>
        <sphereGeometry args={[1, 32, 32]} />
      </mesh>
      <mesh material={belly} position={[1.28, -0.12, -0.6]} scale={0.2}>
        <sphereGeometry args={[1, 24, 24]} />
      </mesh>
      <Eyes mood={mood} level={level} />
    </group>
  );
}

function FieldsTile({ mood, level }: { mood: MascotMood; level?: Level }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(LONDON_FIELDS.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 8, curveSegments: 4 });
    g.center();
    return g;
  }, []);
  const material = useMemo(() => glossy("#00b341"), []);
  const trim = useMemo(() => glossy("#00664f"), []);
  return (
    <group scale={0.78}>
      {/* The park runs north-south; lay it on its side so the character reads as a wide, friendly tile. */}
      <group rotation={[0, 0, Math.PI / 2 - 0.15]}>
        <mesh geometry={geometry} material={material} />
        <mesh geometry={geometry} material={trim} scale={[1.04, 1.04, 0.6]} position={[0, 0, -0.12]} />
      </group>
      <Eyes mood={mood} level={level} z={0.3} y={0.04} spacing={0.24} size={1.1} />
    </group>
  );
}

function Rig({ kind, mood, level }: { kind: MascotKind; mood: MascotMood; level?: Level }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    // Happy: squash-and-stretch hops. Otherwise a gentle breathing sway.
    if ((mood === "talking" || mood === "listening") && level) {
      // Driven by live audio: bounce and squash with loudness.
      const l = level.current;
      g.position.y = THREE.MathUtils.lerp(g.position.y, l * (mood === "talking" ? 0.45 : 0.2), 0.4);
      g.scale.set(1 - l * 0.08, 1 + l * (mood === "talking" ? 0.22 : 0.1), 1 - l * 0.08);
    } else if (mood === "happy") {
      const hop = Math.abs(Math.sin(t * 6));
      g.position.y = hop * 0.35;
      g.scale.set(1 + (1 - hop) * 0.08, 1 - (1 - hop) * 0.08, 1);
    } else {
      g.position.y = THREE.MathUtils.lerp(g.position.y, 0, 0.1);
      const breathe = 1 + Math.sin(t * 1.6) * 0.015;
      g.scale.set(1, breathe, 1);
    }
    g.rotation.y = mood === "sleeping" ? 0 : Math.sin(t * 0.7) * 0.25;
    g.rotation.z = mood === "sleeping" ? 0.18 : 0;
  });
  return <group ref={group}>{kind === "fox" ? <Fox mood={mood} level={level} /> : <FieldsTile mood={mood} level={level} />}</group>;
}

export function Mascot({ kind, mood, className, level }: { kind: MascotKind; mood: MascotMood; className?: string; level?: Level }) {
  return (
    <div className={className}>
      <Canvas camera={{ position: [0, 0.2, 4.2], fov: 32 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[-3, 4, 5]} intensity={2.2} />
        <directionalLight position={[3, 1, -3]} intensity={1.2} color="#bfe6d6" />
        {/* Lights only: an HDR environment meant a 1-2s CDN download per mascot. */}
        <hemisphereLight args={["#ffffff", "#9fb8ad", 1.1]} />
        <Float speed={mood === "happy" || mood === "talking" ? 0 : 1.4} rotationIntensity={0.15} floatIntensity={0.4}>
          <Rig kind={kind} mood={mood} level={level} />
        </Float>
      </Canvas>
    </div>
  );
}
