import { CATEGORIES, type Category, type Report } from "./types";

// Deterministic sample reports scattered along real Hackney streets, used until
// Manjeev's FixMyStreet harvest lands.

const STREETS: [string, number, number][] = [
  ["Mare Street", 51.5455, -0.0553],
  ["Kingsland Road", 51.5395, -0.0757],
  ["Dalston Lane", 51.5475, -0.0650],
  ["Stoke Newington High Street", 51.5620, -0.0745],
  ["Lower Clapton Road", 51.5550, -0.0530],
  ["Hackney Road", 51.5310, -0.0670],
  ["Graham Road", 51.5465, -0.0600],
  ["Richmond Road", 51.5405, -0.0640],
  ["Wick Road", 51.5455, -0.0400],
  ["Homerton High Street", 51.5475, -0.0450],
  ["Amhurst Road", 51.5520, -0.0640],
  ["Shacklewell Lane", 51.5560, -0.0720],
  ["Kenninghall Road", 51.5600, -0.0560],
  ["Morning Lane", 51.5460, -0.0520],
  ["Broadway Market", 51.5370, -0.0620],
  ["Well Street", 51.5410, -0.0480],
  ["Church Street", 51.5620, -0.0800],
  ["Victoria Park Road", 51.5395, -0.0450],
  ["Queensbridge Road", 51.5390, -0.0690],
  ["Brownswood Road", 51.5655, -0.0950],
];

const TITLES: Record<Category, string[]> = {
  pothole: ["Deep pothole in the bus lane", "Pothole by the zebra crossing", "Cluster of potholes", "Sunken patch after roadworks"],
  flytip: ["Mattress dumped on the corner", "Bin bags piled by the wall", "Fridge left on the pavement", "Building rubble dumped"],
  streetlight: ["Streetlight out", "Light flickering all night", "Lamp post leaning", "Three lights out in a row"],
  graffiti: ["Tags on the shop shutter", "Graffiti on the bus shelter", "Offensive graffiti on a wall", "Tags on the railway bridge"],
  pavement: ["Lifted paving slab", "Cracked kerb", "Tree root lifting the pavement", "Loose slabs outside the school"],
};

/** Small deterministic PRNG so the seed is the same on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedReports(count = 212, now = Date.now()): Report[] {
  const rand = mulberry32(42);
  const weights: [Category, number][] = [
    ["pothole", 0.34],
    ["flytip", 0.28],
    ["streetlight", 0.14],
    ["graffiti", 0.12],
    ["pavement", 0.12],
  ];
  const pick = () => {
    let r = rand();
    for (const [c, w] of weights) if ((r -= w) <= 0) return c;
    return CATEGORIES[0];
  };

  return Array.from({ length: count }, (_, i) => {
    const [street, lat, lng] = STREETS[Math.floor(rand() * STREETS.length)];
    const category = pick();
    const titles = TITLES[category];
    const ageDays = Math.floor(rand() ** 1.6 * 120);
    const statusRoll = rand();
    return {
      id: `seed-${i + 1}`,
      lat: lat + (rand() - 0.5) * 0.006,
      lng: lng + (rand() - 0.5) * 0.009,
      category,
      status: statusRoll < 0.72 ? "open" : statusRoll < 0.86 ? "scheduled" : "fixed",
      title: `${titles[Math.floor(rand() * titles.length)]}, ${street}`,
      created_at: new Date(now - ageDays * 86_400_000).toISOString(),
      source: "fixmystreet",
      confirmations: Math.floor(rand() ** 2 * 6),
    } satisfies Report;
  });
}
