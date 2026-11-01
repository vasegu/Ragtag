import type { Metadata } from "next";
import { preload } from "react-dom";
import { ReportLoader } from "./report/ReportLoader";

export const metadata: Metadata = {
  title: "One Hackney",
  description: "One app for Hackney: ask the council anything, report problems and watch them get fixed.",
};

// The whole One Hackney app: phone UI (Home, Ask, Report, Nearby, Me) over the live map.
export default function Home() {
  // Start the 3D map download with the HTML instead of after the app boots.
  preload("/game/hackney.json", { as: "fetch", crossOrigin: "anonymous" });
  return <ReportLoader />;
}
