// Shared contracts for the Report module. See AGENTS.md "Report module contracts".

export const CATEGORIES = ["pothole", "flytip", "streetlight", "graffiti", "pavement"] as const;
export type Category = (typeof CATEGORIES)[number];

export type LatLng = { lat: number; lng: number };

/** Santiago's classifier returns this for one photo. */
export type Classification = {
  category: Category;
  /** 1 (cosmetic) to 5 (dangerous). */
  severity: number;
  /** Risk to people, 0-1. */
  safety: number;
  /** How many people pass it, 0-1 (busy road, school, bus stop). */
  exposure: number;
  /** Model confidence, 0-1. */
  confidence: number;
  /** Short human-readable findings, e.g. "Deeper than 40mm", "Near a bus stop". */
  labels: string[];
};

export type Stage = "reported" | "recognised" | "routed" | "scheduled" | "fixed";
export const STAGES: Stage[] = ["reported", "recognised", "routed", "scheduled", "fixed"];

/** Santiago's ranking returns this for one report. */
export type QueueInfo = {
  position: number;
  total_open: number;
  /** ISO dates: estimated fix window. */
  eta_from: string;
  eta_to: string;
  score: number;
  /** Why the report sits where it does. */
  breakdown: { label: string; points: number }[];
  /** What would move it up. */
  boosts: { label: string; points: number }[];
  /** Who fixes it, e.g. "Hackney Highways", "TfL". */
  owner: string;
  stage: Stage;
};

/** One report on the map: ours or harvested from FixMyStreet (Manjeev). */
export type Report = LatLng & {
  id: string;
  category: Category;
  status: "open" | "scheduled" | "fixed";
  title: string;
  created_at: string;
  source: "app" | "fixmystreet";
  /** Number of neighbours who confirmed it's still there. */
  confirmations: number;
  photo_url?: string;
};

export const CATEGORY_META: Record<Category, { label: string; colour: string; owner: string; deadline: string }> = {
  pothole: { label: "Pothole", colour: "#f08a24", owner: "Hackney Highways", deadline: "28 days (24h if dangerous)" },
  flytip: { label: "Fly-tip", colour: "#7b5cff", owner: "Hackney Waste", deadline: "24 hours" },
  streetlight: { label: "Streetlight", colour: "#ffc93c", owner: "Hackney Street Lighting", deadline: "7 days" },
  graffiti: { label: "Graffiti", colour: "#ff5a4e", owner: "Hackney Cleansing", deadline: "7 days (24h if offensive)" },
  pavement: { label: "Pavement", colour: "#00b341", owner: "Hackney Highways", deadline: "28 days" },
};

/** Spot by London Fields used when GPS is unavailable (e.g. demo laptop). */
export const DEMO_LOCATION: LatLng = { lat: 51.5419, lng: -0.0607 };
