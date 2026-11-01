import type { Metadata } from "next";
import RepairsWorkspace from "../RepairsWorkspace";
import "../dashboard.css";
import "../repairs.css";
export const metadata: Metadata = { title: "Schedule · One Hackney" };
export default function SchedulePage() { return <RepairsWorkspace tab="schedule" />; }
