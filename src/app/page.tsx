import type { Metadata } from "next";
import { ReportLoader } from "./report/ReportLoader";

export const metadata: Metadata = {
  title: "One Hackney",
  description: "One app for Hackney: ask the council anything, report problems and watch them get fixed.",
};

// The whole One Hackney app: phone UI (Home, Ask, Report, Nearby, Me) over the live map.
export default function Home() {
  return <ReportLoader />;
}
