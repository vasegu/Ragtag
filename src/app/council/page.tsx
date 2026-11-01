import type { Metadata } from "next";
import { councilJobs } from "@/lib/council/jobs";
import type { Job } from "@/lib/council/plan";
import { CouncilLoader } from "./CouncilLoader";

export const metadata: Metadata = {
  title: "Day plan · One Hackney for the council",
  description: "Open street jobs clustered into crew routes for the next shift.",
};

export const revalidate = 60;

/** The next working day's date (today on a weekday), as YYYY-MM-DD. */
function shiftDate(now: Date) {
  const d = new Date(now);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function CouncilPage() {
  const now = new Date();
  let jobs: Job[] = [];
  let error: string | null = null;
  try {
    jobs = await councilJobs(now.getTime());
  } catch (err) {
    console.error(err);
    error = "Couldn't load the open reports. Check the Supabase connection.";
  }
  return <CouncilLoader jobs={jobs} date={shiftDate(now)} now={now.getTime()} error={error} />;
}
