"use client";

import { useEffect, useMemo, useRef } from "react";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { CanvasTexture, Color, DoubleSide, DynamicDrawUsage, InstancedMesh, Object3D, SRGBColorSpace, Vector3, type Texture } from "three";
import { CATEGORY_COLOURS, latLngToLocal, type GameReport } from "./map-data";

/** Map-pin disc: white face with a soft dark rim and drop shadow, readable on any background. */
function pinTexture(ring: boolean) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const c = size / 2;
  if (ring) {
    g.shadowColor = "rgba(0,0,0,0.45)";
    g.shadowBlur = 14;
    g.shadowOffsetY = 4;
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(c, c - 2, c - 16, 0, Math.PI * 2);
    g.fill();
    g.shadowColor = "transparent";
    g.lineWidth = 3;
    g.strokeStyle = "rgba(20,20,20,0.25)";
    g.stroke();
  } else {
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(c, c, c - 4, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Pins are drawn on top of buildings and kept a constant size on screen.
const PIN_SCREEN = 0.03; // fraction of camera distance → roughly 26px at default zoom

/**
 * Report pins as map markers: a white disc with the category colour inside, always on top
 * of the city and the same size at any zoom, with a thin stem and ground ring for position.
 * Five instanced draw calls for all reports.
 */
export function ReportBeacons({ reports, origin, reducedMotion, onSelect, day = false }: { reports: GameReport[]; origin: { lat: number; lng: number }; glow?: Texture; reducedMotion: boolean; onSelect?: (id: string) => void; day?: boolean }) {
  const discs = useRef<InstancedMesh>(null), dots = useRef<InstancedMesh>(null), stems = useRef<InstancedMesh>(null), feet = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const tmp = useMemo(() => new Vector3(), []);
  const textures = useMemo(() => ({ ring: pinTexture(true), dot: pinTexture(false) }), []);
  useEffect(() => () => { textures.ring.dispose(); textures.dot.dispose(); }, [textures]);
  const points = useMemo(() => reports.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)).map((report) => ({ id: report.id, ...latLngToLocal(report.lat, report.lng, origin), color: new Color(report.status === "fixed" ? "#9aa5a1" : CATEGORY_COLOURS[report.category]) })), [reports, origin]);

  useEffect(() => {
    for (const mesh of [discs.current, dots.current, stems.current, feet.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      // The white disc stays white; everything else takes the category colour.
      if (mesh !== discs.current) {
        points.forEach((point, i) => mesh.setColorAt(i, point.color));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }, [points]);

  useFrame(({ clock, camera }) => {
    if (!discs.current || !dots.current || !stems.current || !feet.current) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    points.forEach((point, i) => {
      const h = 46 + Math.sin(t * 1.4 + i * 1.7) * (reducedMotion ? 0 : 3);
      tmp.set(point.x, h, -point.y);
      const s = camera.position.distanceTo(tmp) * PIN_SCREEN;
      // Disc and dot face the camera.
      dummy.position.copy(tmp);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      discs.current!.setMatrixAt(i, dummy.matrix);
      dummy.scale.setScalar(s * 0.5);
      dummy.updateMatrix();
      dots.current!.setMatrixAt(i, dummy.matrix);
      // Stem from the ground to the pin.
      dummy.quaternion.identity();
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(point.x, h / 2, -point.y);
      dummy.scale.set(Math.max(1.2, s * 0.05), h, Math.max(1.2, s * 0.05));
      dummy.updateMatrix();
      stems.current!.setMatrixAt(i, dummy.matrix);
      // Ground ring.
      dummy.position.set(point.x, 6, -point.y);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(Math.max(14, s * 0.35));
      dummy.updateMatrix();
      feet.current!.setMatrixAt(i, dummy.matrix);
    });
    for (const mesh of [discs.current, dots.current, stems.current, feet.current]) mesh.instanceMatrix.needsUpdate = true;
  });

  // Instanced meshes report which instance was hit; the disc is the click target.
  const select = (e: ThreeEvent<MouseEvent>) => {
    if (e.instanceId === undefined || !onSelect) return;
    e.stopPropagation();
    onSelect(points[e.instanceId].id);
  };
  const hover = (on: boolean) => () => {
    if (onSelect) document.body.style.cursor = on ? "pointer" : "";
  };

  if (!points.length) return null;
  // Frustum culling is disabled because the instance matrices are animated after creation.
  return <group>
    <instancedMesh key={`stems-${points.length}`} ref={stems} args={[undefined, undefined, points.length]} frustumCulled={false}>
      <cylinderGeometry args={[1, 1, 1, 6, 1, true]} />
      <meshBasicMaterial transparent opacity={day ? 0.75 : 0.55} toneMapped={false} side={DoubleSide} />
    </instancedMesh>
    <instancedMesh key={`feet-${points.length}`} ref={feet} args={[undefined, undefined, points.length]} frustumCulled={false}>
      <ringGeometry args={[0.6, 1, 24]} />
      <meshBasicMaterial transparent opacity={0.8} depthWrite={false} toneMapped={false} />
    </instancedMesh>
    <instancedMesh key={`discs-${points.length}`} ref={discs} args={[undefined, undefined, points.length]} frustumCulled={false} renderOrder={10} onClick={select} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      <planeGeometry />
      <meshBasicMaterial map={textures.ring} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </instancedMesh>
    <instancedMesh key={`dots-${points.length}`} ref={dots} args={[undefined, undefined, points.length]} frustumCulled={false} renderOrder={11} onClick={select} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      <planeGeometry />
      <meshBasicMaterial map={textures.dot} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  </group>;
}
