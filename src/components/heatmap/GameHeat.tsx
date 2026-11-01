"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, Object3D, SRGBColorSpace, type InstancedMesh } from "three";
import { latLngToLocal } from "@/components/game/map-data";
import { MODERATE, type HeatPoint } from "./model";

// Four intensity bands = four instanced draw calls. Per-band opacity keeps it to plain materials (no custom shader).
const BANDS = [
  { from: MODERATE, colour: "#f2784b", opacity: 0.4 },
  { from: 0.3, colour: "#ee5a3f", opacity: 0.55 },
  { from: 0.45, colour: "#e5242b", opacity: 0.7 },
  { from: 0.65, colour: "#c80f1a", opacity: 0.85 },
];
// The default camera sits kilometres away, so true-to-scale discs read as specks; widen them for this view only.
const GAME_SCALE = 2.5;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function Band({ pts, origin, colour, opacity, map }: { pts: HeatPoint[]; origin: { lat: number; lng: number }; colour: string; opacity: number; map: CanvasTexture }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new Object3D();
    pts.forEach((p, i) => {
      const { x, y } = latLngToLocal(p.lat, p.lng, origin);
      dummy.position.set(x, 5, -y); // flat on the ground, under the report pins
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(p.radiusM * 2 * GAME_SCALE);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current!.instanceMatrix.needsUpdate = true;
  }, [pts, origin]);
  if (!pts.length) return null;
  return (
    <instancedMesh key={pts.length} ref={mesh} args={[undefined, undefined, pts.length]} frustumCulled={false} renderOrder={5}>
      <planeGeometry />
      <meshBasicMaterial map={map} color={colour} opacity={opacity} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/** Priority-location heat as soft red discs on the ground of the 3D game map. Static: no per-frame work. */
export function GameHeat({ heat, origin }: { heat: HeatPoint[]; origin: { lat: number; lng: number } }) {
  const map = useMemo(glowTexture, []);
  const bands = useMemo(
    () => BANDS.map((b, i) => ({ ...b, pts: heat.filter((p) => p.intensity >= b.from && p.intensity < (BANDS[i + 1]?.from ?? 2)) })),
    [heat],
  );
  return <group>{bands.map((b) => <Band key={b.from} pts={b.pts} origin={origin} colour={b.colour} opacity={b.opacity} map={map} />)}</group>;
}
