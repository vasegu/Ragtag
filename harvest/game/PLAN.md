# Hackney game mode implementation plan

Goal: an isolated, full-screen night map at `/report/game`, following the user's detailed brief.

Architecture: fetch and simplify OSM geometry offline; build spatially batched extrusions in a browser worker; render toon buildings and instanced animated beacons with React Three Fiber. Use the installed stack, with procedural glow textures rather than a full-screen bloom pass. All writes stay in the four authorized directories; no git commands.

1. `buildings.ts`: Overpass relation-to-area query, endpoint retries, projected/simplified polygons, deterministic heights, multipolygon outer stitching, labelled procedural fallback. Write `public/game/hackney.json` under 6 MB.
2. `src/components/game/`: shared projection/types; transferable geometry worker; scene with 3-step toon palette, outlines, water, roads, parks, stars, beacons, interruptible camera flights, and loading/error states.
3. `src/app/report/game/`: client page with `next/dynamic`, 40 deterministic street-based sample reports, responsive HUD and next-report focus control.
4. Verify data finiteness, shape, size, deterministic fallback and multipolygon stitching. Run TypeScript and scoped ESLint. Inspect desktop/mobile scene and focus changes in browser.

Review focus: failed data fetches; OSM unclosed relation members; Strict Mode worker cancellation/resource cleanup; user orbit interrupting camera flight; rapid focus changes and empty reports. Respect reduced motion. Don't mistake simulated reports or unmeasured performance for live data or guaranteed 60 fps.
