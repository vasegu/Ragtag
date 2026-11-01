import { buildSceneGeometry } from "./geometry";
import type { GameMapData } from "./map-data";

self.onmessage = (event: MessageEvent<GameMapData>) => {
  try {
    const geometry = buildSceneGeometry(event.data);
    const buffers: ArrayBuffer[] = [];
    for (const value of Object.values(geometry)) {
      if (value instanceof Float32Array) buffers.push(value.buffer as ArrayBuffer);
      else for (const attribute of Object.values(value)) buffers.push(attribute.buffer as ArrayBuffer);
    }
    self.postMessage({ geometry }, { transfer: buffers });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Could not build map geometry" });
  }
};
