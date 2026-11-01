# One Hackney game map

Open `/report/game`. The scene is isolated from the Report API and uses 40 explicitly labelled sample reports placed on street segments.

## Rebuild the geography

```sh
npx tsx harvest/game/buildings.ts
```

Queries the OpenStreetMap administrative relation named **London Borough of Hackney**, level 8, via Overpass. Tries overpass-api.de, overpass.kumi.systems and maps.mail.ru in that order, twice, with a timeout per request. If all fail, writes a clearly labelled deterministic procedural illustration. `--fallback` explicitly builds that illustration; it overwrites the existing map, so use it only when wanted.

The included `public/game/hackney.json` uses real OSM data: 19,320 building polygons, 4,528 road segments, 72 water features and 103 parks. The third endpoint succeeded. It is 1,709,377 bytes.

- Origin: latitude 51.5420, longitude -0.0610 (London Fields).
- Coordinates: alternating east/north metres, rounded to 0.5 m. Closed rings omit the duplicate last point.
- `buildings`: `[heightMetres, ring]`. Explicit height, then levels × 3.2, then deterministic 6–14 m.
- `roads`: `[widthMetres, centreline]`. Includes major roads and local streets.
- `water`: `[widthMetres, coordinates]`. Zero width means a polygon; otherwise a river/canal ribbon.
- `parks`: rings. `londonFields`: the park's ring.
- Extra fields: source, attribution and generation time for OSM data.

Multipart outer rings are joined and deduplicated. The compact single-ring format intentionally fills interior courtyards/holes. Boundaries are simplified, and OSM ways that cross the borough edge retain their complete geometry. This is a stylised map, not surveying data.

## Component contract

`HackneyGame` accepts `reports?`, `focus?` and an optional `onMapReady(data)` callback. `latLngToLocal(lat, lng, origin?)` is exported from `HackneyGame.tsx` and the lightweight `map-data.ts`. It returns `{ x, y }` in metres; Three.js uses `[x, altitude, -y]`.

The scene uses a worker with transferable buffers, one merged building mesh (~298k triangles), merged outlines and ground layers, and four instanced beacon meshes. About 15 scene draw calls; pixel ratio is capped at 1.5, with no shadow maps or full-screen bloom pass. Glow is implemented with additive textures. Heights are exaggerated 1.65× for readability. Motion respects the reduced-motion preference; orbit gestures cancel camera flights.

## Verification

```sh
npx tsx --test harvest/game/verify.test.ts
npx tsc --noEmit --incremental false
npx eslint src/app/report/game src/components/game
```

The only added dependency is `@types/geojson` (development), needed to resolve the existing report map's missing global GeoJSON types during the required whole-project check.

Geometry construction measured ~295 ms and ~40 MB of transferable attributes on this machine. This is CPU preparation timing, not an FPS benchmark. Browser visual/interaction QA and the 60 fps target remain unverified because browser access was unavailable and native Chrome access was denied. The local route and JSON returned HTTP 200; Next compiled the client component and worker chunks.

OSM data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Overpass query syntax follows the [Overpass QL reference](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL).
