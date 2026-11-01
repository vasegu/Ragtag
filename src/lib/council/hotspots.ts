import type { HeatCell } from "./ops";

// Long-term fixes for repeat problems: turn a hotspot (many reports in one grid cell over
// several weeks) into a root-cause intervention, instead of clearing the same spot again.

export type Persistence = "one-off" | "recurring" | "chronic";

export type Hotspot = HeatCell & {
  categories: string[];
  persistence: Persistence;
  /** Higher = more worth a long-term fix: volume weighted by how long it keeps coming back. */
  score: number;
  fix: { title: string; actions: string[]; owner: string; why: string };
};

const FIXES: { match: RegExp; title: string; actions: string[]; owner: string }[] = [
  {
    match: /fly.?tip/i,
    title: "Design out fly-tipping",
    actions: ["Install a CCTV or camera trap with warning signs", "Weekly enforcement patrol for 6 weeks", "Write to nearby blocks about free and low-cost bulky waste collection"],
    owner: "Waste and Enforcement",
  },
  {
    match: /dog poo|fouling/i,
    title: "Tackle repeat dog fouling",
    actions: ["Add a dog waste bin and signage", "Targeted patrols at morning and evening walking times"],
    owner: "Cleansing and Enforcement",
  },
  {
    match: /litter|bin/i,
    title: "Fix litter at the source",
    actions: ["Add or upsize litter bins at this spot", "Empty more often on Friday to Sunday", "Ask nearby takeaways to join a litter pledge"],
    owner: "Cleansing",
  },
  {
    match: /parking|vehicle|idling/i,
    title: "Stop repeat obstruction",
    actions: ["Review restrictions: yellow lines, bollards or a loading bay", "Add this street to the enforcement rota"],
    owner: "Parking and Highways",
  },
  {
    match: /drain|gully|flood/i,
    title: "Prevent drainage failures",
    actions: ["Add these gullies to the proactive cleansing schedule", "CCTV survey of the drain run"],
    owner: "Highways drainage",
  },
  {
    match: /pothole|surface|safety concern|obstruction|pavement|footway/i,
    title: "Plan a permanent repair",
    actions: ["Bring forward planned resurfacing for this section", "Check for a drainage or utility cause before patching again"],
    owner: "Highways",
  },
  {
    match: /light/i,
    title: "Upgrade the lighting",
    actions: ["Replace with LED lanterns", "Test cabling and the column for faults"],
    owner: "Street lighting",
  },
];

export function toHotspots(cells: HeatCell[]): Hotspot[] {
  return cells
    .map((c) => {
      const categories = (c.top_categories ?? "")
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !/internal use/i.test(s));
      const persistence: Persistence = c.active_weeks >= 3 ? "chronic" : c.active_weeks >= 2 || c.active_days >= 3 ? "recurring" : "one-off";
      const lead = categories[0] ?? "";
      const rule = FIXES.find((f) => f.match.test(lead)) ?? FIXES.find((f) => categories.some((x) => f.match.test(x)));
      const fix = rule
        ? { title: rule.title, actions: rule.actions, owner: rule.owner }
        : { title: "Joint inspection", actions: ["Walk the area with Highways and Cleansing to find the root cause"], owner: "Area team" };
      return {
        ...c,
        categories,
        persistence,
        score: c.reports * (1 + c.active_weeks),
        fix: {
          ...fix,
          why: `${c.reports} reports over ${c.active_days} day${c.active_days === 1 ? "" : "s"} (${c.active_weeks} week${c.active_weeks === 1 ? "" : "s"})${lead ? `, mostly ${lead.toLowerCase()}` : ""}.`,
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}
