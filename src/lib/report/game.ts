"use client";

import { useCallback, useEffect, useState } from "react";
import type { Category } from "./types";

// Player state for the game layer, kept on the device (no login yet; council ID login later).

export const LEVELS = [
  { xp: 0, name: "Newcomer" },
  { xp: 100, name: "Street Scout" },
  { xp: 250, name: "Pavement Pal" },
  { xp: 500, name: "Pothole Hunter" },
  { xp: 900, name: "Street Guardian" },
  { xp: 1400, name: "Hackney Hero" },
  { xp: 2000, name: "Legend of the Fields" },
];

export const XP = { report: 50, verify: 20, photo: 10 } as const;

export type BadgeId =
  | "first-report"
  | "pothole-hunter"
  | "street-scout"
  | "verifier"
  | "fixer"
  | "night-owl"
  | "early-bird"
  | "local-hero"
  | "streak-7"
  | "ward-champion"
  | "kudos";

export const BADGES: Record<BadgeId, { name: string; how: string }> = {
  "first-report": { name: "First Report", how: "Report your first problem" },
  "streak-7": { name: "On Fire", how: "Help 7 days in a row" },
  "pothole-hunter": { name: "Pothole Hunter", how: "Report 3 potholes" },
  verifier: { name: "Truth Teller", how: "Confirm 3 neighbours' reports" },
  "street-scout": { name: "Street Scout", how: "Report 5 problems" },
  fixer: { name: "Fixed It", how: "Have a report fixed" },
  "night-owl": { name: "Night Owl", how: "Report after 8pm" },
  "early-bird": { name: "Early Bird", how: "Report before 8am" },
  kudos: { name: "High Five", how: "Get 10 kudos from neighbours" },
  "local-hero": { name: "Local Hero", how: "10 reports in your ward" },
  "ward-champion": { name: "Ward Champion", how: "Top your ward's weekly board" },
};

export const WARDS = [
  { name: "London Fields", points: 4820 },
  { name: "Dalston", points: 5110 },
  { name: "Hackney Wick", points: 3970 },
  { name: "Stoke Newington", points: 4410 },
  { name: "Homerton", points: 3020 },
  { name: "Clapton", points: 3680 },
];

export type Player = {
  handle: string;
  ward: string;
  xp: number;
  streak: number;
  /** ISO date (yyyy-mm-dd) of the last helpful action, for the streak. */
  lastActive: string;
  freezes: number;
  badges: BadgeId[];
  reports: { id: string; category: Category; at: string }[];
  verifies: number;
  kudos: number;
  /** Weekly rings. */
  rings: { report: number; verify: number; fixed: number };
};

export const RING_GOALS = { report: 3, verify: 5, fixed: 2 };

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

/** Demo profile: a regular who is one day off a 7-day streak, so the first report unlocks a badge. */
function demoPlayer(): Player {
  return {
    handle: "Fox of London Fields",
    ward: "London Fields",
    xp: 430,
    streak: 6,
    lastActive: yesterday(),
    freezes: 1,
    badges: ["first-report", "verifier", "early-bird"],
    reports: [
      { id: "past-1", category: "flytip", at: "2026-10-20" },
      { id: "past-2", category: "pothole", at: "2026-10-24" },
      { id: "past-3", category: "pothole", at: "2026-10-29" },
    ],
    verifies: 4,
    kudos: 7,
    rings: { report: 1, verify: 3, fixed: 1 },
  };
}

const KEY = "one-hackney-player-v1";

function load(): Player {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Player;
  } catch {
    // storage unavailable (private mode, previews): fall through to the demo profile
  }
  return demoPlayer();
}

export function levelFor(xp: number) {
  let i = 0;
  while (i < LEVELS.length - 1 && xp >= LEVELS[i + 1].xp) i++;
  const current = LEVELS[i];
  const next = LEVELS[i + 1];
  return {
    level: i + 1,
    name: current.name,
    nextName: next?.name,
    progress: next ? (xp - current.xp) / (next.xp - current.xp) : 1,
    toNext: next ? next.xp - xp : 0,
  };
}

export type Reward = { xp: number; badges: BadgeId[]; levelUp?: string; streak: number; streakExtended: boolean };

export function usePlayer() {
  const [player, setPlayer] = useState<Player>(demoPlayer);

  useEffect(() => setPlayer(load()), []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(player));
    } catch {
      // ignore
    }
  }, [player]);

  /** Apply a helpful action and return what the player earned, for the celebration screen. */
  const act = useCallback(
    (action: { type: "report"; id: string; category: Category } | { type: "verify" }): Reward => {
      const before = player;
      const next: Player = structuredClone(before);
      let xp = 0;

      if (action.type === "report") {
        xp += XP.report;
        next.reports.push({ id: action.id, category: action.category, at: today() });
        next.rings.report += 1;
      } else {
        xp += XP.verify;
        next.verifies += 1;
        next.rings.verify += 1;
      }

      // Any helpful action counts for the streak, at most once a day.
      let streakExtended = false;
      if (before.lastActive !== today()) {
        next.streak = before.lastActive === yesterday() ? before.streak + 1 : 1;
        next.lastActive = today();
        streakExtended = true;
      }

      const hour = new Date().getHours();
      const earned = new Set(before.badges);
      const unlock = (id: BadgeId, when: boolean) => {
        if (when && !earned.has(id)) {
          earned.add(id);
          next.badges.push(id);
        }
      };
      unlock("first-report", next.reports.length >= 1);
      unlock("streak-7", next.streak >= 7);
      unlock("pothole-hunter", next.reports.filter((r) => r.category === "pothole").length >= 3);
      unlock("verifier", next.verifies >= 3);
      unlock("street-scout", next.reports.length >= 5);
      unlock("night-owl", action.type === "report" && hour >= 20);
      unlock("early-bird", action.type === "report" && hour < 8);

      const newBadges = next.badges.filter((b) => !before.badges.includes(b));
      xp += newBadges.length * 25;
      next.xp = before.xp + xp;

      const lvBefore = levelFor(before.xp);
      const lvAfter = levelFor(next.xp);
      setPlayer(next);
      return {
        xp,
        badges: newBadges,
        levelUp: lvAfter.level > lvBefore.level ? lvAfter.name : undefined,
        streak: next.streak,
        streakExtended,
      };
    },
    [player],
  );

  const reset = useCallback(() => setPlayer(demoPlayer()), []);

  return { player, act, reset };
}
