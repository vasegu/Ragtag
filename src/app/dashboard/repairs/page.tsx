import type { Metadata } from "next";
import RepairsWorkspace from "../RepairsWorkspace";
import "../dashboard.css";
import "../repairs.css";
export const metadata: Metadata = { title: "Repairs · One Hackney" };
export default function RepairsPage() { return <RepairsWorkspace tab="repairs" />; }
