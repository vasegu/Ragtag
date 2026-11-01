import type { Category, LatLng } from "@/lib/report/types";

// Council day planner: turns the open street jobs into crew routes for one shift.
// Deliberately simple and explainable, so a supervisor can follow every decision:
//   1. Each job belongs to a trade (from the photo pipeline's work order, else a category default).
//   2. Within a trade, jobs closer than ~250 m are clustered and done on the same visit.
//   3. Each crew owns a slice of the borough (angular sweep around the depot, balanced by work).
//   4. Clusters are placed in priority order into their slice's crew (cheapest insertion),
//      spilling to another crew of the same trade when full; whatever doesn't fit rolls to tomorrow.
//   5. Each crew's stops are re-ordered with nearest-neighbour + 2-opt, then timed from 08:00.
// Travel is straight-line distance x a detour factor at an urban average speed; no road routing.

export type Trade = "waste" | "cleansing" | "highways" | "electrician" | "enforcement";
export const TRADE_ORDER: Trade[] = ["waste", "cleansing", "highways", "electrician", "enforcement"];

export const TRADES: Record<Trade, { label: string; crew: string; shades: string[] }> = {
  waste: { label: "Waste", crew: "Waste crew", shades: ["#7b5cff", "#4b2fc4", "#a48bff", "#311d8f", "#c5b6ff"] },
  cleansing: { label: "Cleansing", crew: "Cleansing crew", shades: ["#1597a3", "#0b6a73", "#5ccdd6", "#05474d", "#9be3e8"] },
  highways: { label: "Highways", crew: "Highways gang", shades: ["#f08a24", "#b85e0c", "#f7b26b", "#7f3f05", "#fbd2a6"] },
  electrician: { label: "Street lighting", crew: "Electrician", shades: ["#d9a400", "#9c7500", "#f0c94a", "#6b5000", "#f7e08f"] },
  enforcement: { label: "Enforcement", crew: "Enforcement officer", shades: ["#4f8cff", "#2557c7", "#8db4ff", "#143a8f", "#bfd5ff"] },
};

/** Defaults when a job has no work order: which trade fixes it and minutes on site. */
export const CATEGORY_WORK: Record<Category, { trade: Trade; minutes: number }> = {
  flytip: { trade: "waste", minutes: 20 },
  litter: { trade: "cleansing", minutes: 10 },
  graffiti: { trade: "cleansing", minutes: 30 },
  pothole: { trade: "highways", minutes: 45 },
  pavement: { trade: "highways", minutes: 40 },
  streetlight: { trade: "electrician", minutes: 30 },
  parking: { trade: "enforcement", minutes: 10 },
};

export const DEFAULT_CREWS: Record<Trade, number> = { waste: 2, cleansing: 1, highways: 1, electrician: 1, enforcement: 1 };

/** Millfields depot, Lower Clapton (Hackney's main street services yard). */
export const DEPOT: LatLng = { lat: 51.5568, lng: -0.0457 };

export type Job = LatLng & {
  id: string;
  category: Category;
  title: string;
  /** Planner order across all open work: 1 = most urgent. */
  rank: number;
  severity: string;
  createdAt: string;
  /** From the work order when the photo pipeline produced one. */
  trade?: Trade;
  minutes?: number;
  crewSize?: number;
  tasks?: string[];
  source: "fixmystreet" | "assessment";
};

export type Stop = {
  n: number;
  job: Job;
  minutes: number;
  /** Minutes after midnight. */
  arrive: number;
  depart: number;
  travelMin: number;
  km: number;
  /** Cluster id: stops sharing it are one visit. */
  cluster: number;
};

export type CrewRoute = {
  id: string;
  trade: Trade;
  index: number;
  label: string;
  colour: string;
  stops: Stop[];
  km: number;
  travelMin: number;
  workMin: number;
  /** Minutes after midnight the crew is back at the depot. */
  finish: number;
  returnMin: number;
};

export type DayPlan = { crews: CrewRoute[]; overflow: Job[]; clusters: number };

export type PlanOptions = {
  crews: Record<Trade, number>;
  depot?: LatLng;
  /** Shift start, minutes after midnight. */
  start?: number;
  shiftMin?: number;
  speedKmh?: number;
  /** Straight line to road distance. */
  detour?: number;
  radiusM?: number;
};

const defaults = { depot: DEPOT, start: 8 * 60, shiftMin: 450, speedKmh: 15, detour: 1.3, radiusM: 250 };
type Opts = Required<PlanOptions>;

export function tradeOf(job: Job): Trade {
  return job.trade ?? CATEGORY_WORK[job.category].trade;
}
export function minutesOf(job: Job): number {
  return job.minutes ?? CATEGORY_WORK[job.category].minutes;
}

export function km(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Cluster = { id: number; jobs: Job[]; rank: number; centre: LatLng };

/** Single-linkage clustering: jobs within `radiusM` of each other (transitively) share a cluster. */
export function clusterJobs(jobs: Job[], radiusM: number): Cluster[] {
  const parent = jobs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < jobs.length; i++)
    for (let j = i + 1; j < jobs.length; j++) if (km(jobs[i], jobs[j]) * 1000 <= radiusM) parent[find(i)] = find(j);
  const groups = new Map<number, Job[]>();
  jobs.forEach((job, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), job]));
  return [...groups.values()]
    .map((g) => g.sort(byRank))
    .sort((a, b) => byRank(a[0], b[0]))
    .map((g, id) => ({
      id,
      jobs: g,
      rank: g[0].rank,
      centre: { lat: g.reduce((s, j) => s + j.lat, 0) / g.length, lng: g.reduce((s, j) => s + j.lng, 0) / g.length },
    }));
}

const byRank = (a: Job, b: Job) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A crew's tour while it's being built: job order only, depot implied at both ends. */
class Tour {
  jobs: Job[] = [];
  work = 0;
  constructor(private o: Opts) {}
  leg(a: LatLng, b: LatLng) {
    return ((km(a, b) * this.o.detour) / this.o.speedKmh) * 60;
  }
  at(i: number): LatLng {
    return i < 0 || i >= this.jobs.length ? this.o.depot : this.jobs[i];
  }
  travel(order = this.jobs) {
    let t = 0;
    let prev: LatLng = this.o.depot;
    for (const j of order) {
      t += this.leg(prev, j);
      prev = j;
    }
    return t + this.leg(prev, this.o.depot);
  }
  total() {
    return this.travel() + this.work;
  }
  /** Best position and extra travel minutes to insert `job`. */
  bestInsert(job: LatLng) {
    let best = { pos: 0, cost: Infinity };
    for (let i = 0; i <= this.jobs.length; i++) {
      const cost = this.leg(this.at(i - 1), job) + this.leg(job, this.at(i)) - this.leg(this.at(i - 1), this.at(i));
      if (cost < best.cost - 1e-9) best = { pos: i, cost };
    }
    return best;
  }
  insert(job: Job) {
    this.jobs.splice(this.bestInsert(job).pos, 0, job);
    this.work += minutesOf(job);
  }
  /** Re-order: nearest-neighbour from the depot, then 2-opt; keep whichever is shorter (including the insertion order). */
  optimise() {
    const nn: Job[] = [];
    const left = [...this.jobs];
    let cur: LatLng = this.o.depot;
    while (left.length) {
      let bi = 0;
      for (let i = 1; i < left.length; i++) if (this.leg(cur, left[i]) < this.leg(cur, left[bi]) - 1e-9) bi = i;
      cur = left.splice(bi, 1)[0];
      nn.push(cur as Job);
    }
    const a = this.twoOpt([...this.jobs]);
    const b = this.twoOpt(nn);
    this.jobs = this.travel(b) < this.travel(a) - 1e-9 ? b : a;
  }
  twoOpt(order: Job[]) {
    const pt = (i: number): LatLng => (i < 0 || i >= order.length ? this.o.depot : order[i]);
    for (let improved = true, pass = 0; improved && pass < 50; pass++) {
      improved = false;
      for (let i = 0; i < order.length - 1; i++)
        for (let k = i + 1; k < order.length; k++) {
          const before = this.leg(pt(i - 1), pt(i)) + this.leg(pt(k), pt(k + 1));
          const after = this.leg(pt(i - 1), pt(k)) + this.leg(pt(i), pt(k + 1));
          if (after < before - 1e-6) {
            order.splice(i, k - i + 1, ...order.slice(i, k + 1).reverse());
            improved = true;
          }
        }
    }
    return order;
  }
}

/** Split clusters into `n` contiguous angular slices around the depot with roughly equal work. */
function sweep(clusters: Cluster[], n: number, depot: LatLng): Map<number, number> {
  const home = new Map<number, number>();
  if (n <= 1) {
    clusters.forEach((c) => home.set(c.id, 0));
    return home;
  }
  const angle = (c: Cluster) => Math.atan2(c.centre.lat - depot.lat, (c.centre.lng - depot.lng) * Math.cos((depot.lat * Math.PI) / 180));
  const sorted = [...clusters].sort((a, b) => angle(a) - angle(b) || a.id - b.id);
  // Start the sweep after the widest empty gap so no slice straddles it.
  let gapAt = 0;
  let widest = -1;
  sorted.forEach((c, i) => {
    const next = sorted[(i + 1) % sorted.length];
    const gap = (angle(next) - angle(c) + 2 * Math.PI) % (2 * Math.PI) || (sorted.length === 1 ? 2 * Math.PI : 0);
    if (gap > widest) {
      widest = gap;
      gapAt = (i + 1) % sorted.length;
    }
  });
  const ring = [...sorted.slice(gapAt), ...sorted.slice(0, gapAt)];
  const work = (c: Cluster) => c.jobs.reduce((s, j) => s + minutesOf(j), 0);
  const total = ring.reduce((s, c) => s + work(c), 0);
  let acc = 0;
  for (const c of ring) {
    home.set(c.id, Math.min(n - 1, Math.floor(((acc + work(c) / 2) / total) * n)));
    acc += work(c);
  }
  return home;
}

/** Plan one shift. Pure and deterministic: same jobs and crews give the same plan. */
export function planDay(jobs: Job[], options: PlanOptions): DayPlan {
  const o: Opts = { ...defaults, ...options };
  const crews: CrewRoute[] = [];
  const overflow: Job[] = [];
  let clusterCount = 0;
  const clusterOf = new Map<string, number>();

  for (const trade of TRADE_ORDER) {
    const mine = jobs.filter((j) => tradeOf(j) === trade);
    const n = Math.max(0, o.crews[trade] ?? 0);
    if (!mine.length && !n) continue;
    const clusters = clusterJobs(mine, o.radiusM);
    clusters.forEach((c) => c.jobs.forEach((j) => clusterOf.set(j.id, clusterCount + c.id)));
    clusterCount += clusters.length;
    if (!n) {
      overflow.push(...mine);
      continue;
    }
    const tours = Array.from({ length: n }, () => new Tour(o));
    const home = sweep(clusters, n, o.depot);
    const fits = (t: Tour, add: Job[]) => {
      const trial = new Tour(o);
      trial.jobs = [...t.jobs];
      trial.work = t.work;
      add.forEach((j) => trial.insert(j));
      return trial.total() <= o.shiftMin;
    };
    for (const c of clusters) {
      const h = home.get(c.id)!;
      // Home crew first, then the others by how little extra driving the visit adds.
      const order = tours
        .map((t, i) => ({ i, cost: i === h ? -Infinity : t.bestInsert(c.centre).cost }))
        .sort((a, b) => a.cost - b.cost || a.i - b.i)
        .map((x) => tours[x.i]);
      const whole = order.find((t) => fits(t, c.jobs));
      if (whole) {
        c.jobs.forEach((j) => whole.insert(j));
        continue;
      }
      // Too big for any one crew today: take the most urgent jobs that fit, roll the rest.
      for (const j of c.jobs) {
        const t = order.find((t) => fits(t, [j]));
        if (t) t.insert(j);
        else overflow.push(j);
      }
    }
    tours.forEach((tour, index) => {
      tour.optimise();
      let t = o.start;
      let prev: LatLng = o.depot;
      let dist = 0;
      let travel = 0;
      const stops: Stop[] = tour.jobs.map((job, i) => {
        const d = km(prev, job) * o.detour;
        const leg = tour.leg(prev, job);
        dist += d;
        travel += leg;
        t += leg;
        const minutes = minutesOf(job);
        const stop: Stop = { n: i + 1, job, minutes, arrive: t, depart: t + minutes, travelMin: leg, km: d, cluster: clusterOf.get(job.id)! };
        t += minutes;
        prev = job;
        return stop;
      });
      const back = tour.leg(prev, o.depot);
      crews.push({
        id: `${trade}-${index + 1}`,
        trade,
        index,
        label: `${TRADES[trade].crew} ${index + 1}`,
        colour: TRADES[trade].shades[index % TRADES[trade].shades.length],
        stops,
        km: dist + km(prev, o.depot) * o.detour,
        travelMin: travel + back,
        workMin: tour.work,
        finish: t + back,
        returnMin: back,
      });
    });
  }
  return { crews, overflow: overflow.sort(byRank), clusters: clusterCount };
}

export type Backlog = {
  today: DayPlan;
  /** Jobs cleared on each working day, today first, until the backlog is empty or `maxDays`. */
  perDay: number[];
  /** Working days to clear everything open now; null when some trade has no crews or it takes longer than `maxDays`. */
  daysToClear: number | null;
  /** Trades still working on the last day (or never finishing): what holds the backlog up. */
  bottleneck: Trade[];
};

/** Plan today, then keep planning the leftovers day after day to see when the backlog clears (no new reports assumed). */
export function planBacklog(jobs: Job[], options: PlanOptions, maxDays = 30): Backlog {
  const today = planDay(jobs, options);
  const perDay = [jobs.length - today.overflow.length];
  let left = today.overflow;
  let lastDay = jobs;
  while (left.length && perDay.length < maxDays) {
    lastDay = left;
    const next = planDay(left, options);
    const done = left.length - next.overflow.length;
    if (!done) break;
    perDay.push(done);
    left = next.overflow;
  }
  const holding = left.length ? left : perDay.length > 1 ? lastDay : [];
  const bottleneck = TRADE_ORDER.filter((t) => holding.some((j) => tradeOf(j) === t));
  return { today, perDay, daysToClear: left.length ? null : perDay.length, bottleneck };
}

export const clock = (min: number) => {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
