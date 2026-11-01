"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { latLngToLocal } from "./map-data";

type Location = { lat: number; lng: number };
type Flight = { elapsed: number; duration: number; from: Vector3; to: Vector3; fromTarget: Vector3; target: Vector3 };

export function CameraRig({ focus, origin, reducedMotion }: { focus?: Location | null; origin: Location; reducedMotion: boolean }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera);
  const flight = useRef<Flight | null>(null);
  const firstFlight = useRef(true);

  useEffect(() => {
    if (!controls.current) return;
    const lat = focus?.lat, lng = focus?.lng;
    const point = lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng) ? latLngToLocal(lat, lng, origin) : { x: 0, y: 0 };
    const isFocus = Math.abs(point.x) + Math.abs(point.y) > 0.5;
    const target = new Vector3(point.x, 0, -point.y);
    const to = target.clone().add(isFocus ? new Vector3(360, 540, 620) : new Vector3(750, 1100, 1450));
    flight.current = { elapsed: 0, duration: reducedMotion ? 0 : firstFlight.current ? 4.2 : 1.8, from: camera.position.clone(), to, fromTarget: controls.current.target.clone(), target };
  }, [camera, focus, origin, reducedMotion]);

  useFrame((_, delta) => {
    if (!controls.current) return;
    const current = flight.current;
    if (current) {
      current.elapsed += Math.min(delta, 0.05);
      const progress = current.duration === 0 ? 1 : Math.min(1, current.elapsed / current.duration);
      const ease = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      camera.position.lerpVectors(current.from, current.to, ease);
      controls.current.target.lerpVectors(current.fromTarget, current.target, ease);
      controls.current.update();
      if (progress === 1) { flight.current = null; firstFlight.current = false; }
    }
    // Constrain panning to the borough and keep its ground plane as the orbit target.
    const target = controls.current.target;
    const dx = Math.max(-4800, Math.min(4800, target.x)) - target.x;
    const dz = Math.max(-4800, Math.min(6200, target.z)) - target.z;
    camera.position.x += dx;
    camera.position.z += dz;
    target.x += dx;
    target.z += dz;
    target.y = 0;
  });

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.07} screenSpacePanning={false} minDistance={120} maxDistance={9000} minPolarAngle={0.12} maxPolarAngle={Math.PI / 2.3} zoomSpeed={0.65} rotateSpeed={0.5} panSpeed={0.6} onStart={() => { flight.current = null; firstFlight.current = false; }} />;
}
