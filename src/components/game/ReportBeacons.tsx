"use client";

import { useEffect, useMemo, useRef } from "react";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, DoubleSide, DynamicDrawUsage, InstancedMesh, Object3D, type Texture } from "three";
import { CATEGORY_COLOURS, latLngToLocal, type GameReport } from "./map-data";

/** All reports share four draw calls, irrespective of their category. */
export function ReportBeacons({ reports, origin, glow, reducedMotion, onSelect }: { reports: GameReport[]; origin: { lat: number; lng: number }; glow: Texture; reducedMotion: boolean; onSelect?: (id: string) => void }) {
  const cores = useRef<InstancedMesh>(null), columns = useRef<InstancedMesh>(null), halos = useRef<InstancedMesh>(null), feet = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const points = useMemo(() => reports.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)).map((report) => ({ id: report.id, ...latLngToLocal(report.lat, report.lng, origin), color: new Color(report.status === "fixed" ? "#d8e9e7" : CATEGORY_COLOURS[report.category]) })), [reports, origin]);

  useEffect(() => {
    for (const mesh of [cores.current, columns.current, halos.current, feet.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      points.forEach((point, i) => mesh.setColorAt(i, point.color));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [points]);

  useFrame(({ clock, camera }) => {
    if (!cores.current || !columns.current || !halos.current || !feet.current) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    points.forEach((point, i) => {
      const h = 62 + Math.sin(t * 1.5 + i * 1.7) * (reducedMotion ? 0 : 6);
      dummy.position.set(point.x, h, -point.y);
      dummy.rotation.set(0, t * 0.35 + i, Math.PI / 4);
      dummy.scale.setScalar(10);
      dummy.updateMatrix();
      cores.current!.setMatrixAt(i, dummy.matrix);
      dummy.rotation.set(0, 0, 0);
      dummy.position.y = h / 2;
      dummy.scale.set(4.5, h, 4.5);
      dummy.updateMatrix();
      columns.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.y = h;
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(85 + Math.sin(t + i) * 5);
      dummy.updateMatrix();
      halos.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 6;
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(23);
      dummy.updateMatrix();
      feet.current!.setMatrixAt(i, dummy.matrix);
    });
    for (const mesh of [cores.current, columns.current, halos.current, feet.current]) mesh.instanceMatrix.needsUpdate = true;
  });

  // Instanced meshes report which instance was hit; the halo is the big, easy target.
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
    <instancedMesh key={`cores-${points.length}`} ref={cores} args={[undefined, undefined, points.length]} frustumCulled={false} onClick={select} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      <octahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
    <instancedMesh key={`columns-${points.length}`} ref={columns} args={[undefined, undefined, points.length]} frustumCulled={false}>
      <cylinderGeometry args={[0.45, 1, 1, 6, 1, true]} />
      <meshBasicMaterial transparent opacity={0.17} blending={AdditiveBlending} depthWrite={false} toneMapped={false} side={DoubleSide} />
    </instancedMesh>
    <instancedMesh key={`halos-${points.length}`} ref={halos} args={[undefined, undefined, points.length]} frustumCulled={false} onClick={select} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      <planeGeometry />
      <meshBasicMaterial map={glow} transparent opacity={0.75} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
    <instancedMesh key={`feet-${points.length}`} ref={feet} args={[undefined, undefined, points.length]} frustumCulled={false}>
      <ringGeometry args={[0.75, 1, 24]} />
      <meshBasicMaterial transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  </group>;
}
