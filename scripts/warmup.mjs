// Warm every page and API on the live site before a demo: `npm run warmup`.
const BASE = process.argv[2] ?? "https://ragtag-kappa.vercel.app";
const targets = [
  "/", "/game/hackney.json", "/api/reports", "/api/search?q=council%20tax",
  "/dashboard", "/dashboard/repairs", "/dashboard/schedule", "/dashboard/dispatch", "/dashboard/hotspots",
  "/api/dashboard/issues", "/api/dashboard/issues?source=jobs",
  "/renders/demo/pothole.jpg", "/renders/demo/flytip.jpg", "/renders/demo/streetlight.jpg", "/renders/demo/graffiti.jpg",
];

const hit = async (path, init) => {
  const t = Date.now();
  try {
    const res = await fetch(BASE + path, init);
    await res.arrayBuffer();
    return `${String(res.status).padEnd(4)} ${String(Date.now() - t).padStart(5)} ms  ${path}`;
  } catch (e) {
    return `FAIL ${String(Date.now() - t).padStart(5)} ms  ${path}  ${e.message}`;
  }
};

console.log(`Warming ${BASE}\n`);
for (const round of [1, 2]) {
  const lines = await Promise.all(targets.map((p) => hit(p)));
  lines.push(await hit("/api/realtime", { method: "POST" }));
  console.log(`Round ${round}${round === 2 ? " (should all be fast now)" : ""}`);
  console.log(lines.join("\n") + "\n");
}
