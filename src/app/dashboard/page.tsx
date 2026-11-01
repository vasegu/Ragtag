import type { Metadata } from "next";
import Dashboard from "./Dashboard";
import "./dashboard.css";

export const metadata: Metadata = { title: "Repairs overview · One Hackney" };

export default function DashboardPage() { return <Dashboard />; }
