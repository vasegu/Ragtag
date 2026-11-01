export const ORIGIN = { lat: 51.542, lng: -0.061 } as const;
const METRES_PER_DEGREE = Math.PI * 6378137 / 180;

/** Local x = east, y = north (metres). Three.js position is [x, altitude, -y]. */
export function latLngToLocal(lat: number, lng: number, origin: { lat: number; lng: number } = ORIGIN) {
  return {
    x: (lng - origin.lng) * METRES_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180),
    y: (lat - origin.lat) * METRES_PER_DEGREE,
  };
}

export function localToLatLng(x: number, y: number, origin: { lat: number; lng: number } = ORIGIN) {
  return {
    lat: origin.lat + y / METRES_PER_DEGREE,
    lng: origin.lng + x / (METRES_PER_DEGREE * Math.cos(origin.lat * Math.PI / 180)),
  };
}

export type GameMapData = {
  buildings: [height: number, polygon: number[]][];
  roads: [width: number, line: number[]][];
  /** width 0 = closed water polygon; positive width = river/canal centreline. */
  water: [width: number, coordinates: number[]][];
  parks: number[][];
  londonFields: number[];
  origin: { lat: number; lng: number };
  source: "openstreetmap" | "procedural";
  attribution: string;
  generatedAt?: string;
};

export type GameReport = {
  id: string;
  lat: number;
  lng: number;
  category: "pothole" | "flytip" | "streetlight" | "graffiti" | "pavement";
  status?: "open" | "scheduled" | "fixed";
};

export const CATEGORY_COLOURS: Record<GameReport["category"], string> = {
  pothole: "#f08a24", flytip: "#7b5cff", streetlight: "#ffc93c", graffiti: "#ff5a4e", pavement: "#00b341",
};

let mapRequest: Promise<GameMapData> | undefined;
/** Page and canvas share one download; a failed request can be retried. */
export function loadGameMap(refresh = false): Promise<GameMapData> {
  if (refresh) mapRequest = undefined;
  if (!mapRequest) {
    mapRequest = fetch("/game/hackney.json").then(async (response) => {
      if (!response.ok) throw new Error(`Map download failed (${response.status})`);
      const data = await response.json() as GameMapData;
      if (!data.origin || !Number.isFinite(data.origin.lat) || !Number.isFinite(data.origin.lng) || !Array.isArray(data.buildings) || !Array.isArray(data.roads) || !Array.isArray(data.water) || !Array.isArray(data.parks) || !Array.isArray(data.londonFields)) throw new Error("The map file is incomplete");
      return data;
    }).catch((error) => { mapRequest = undefined; throw error; });
  }
  return mapRequest;
}
