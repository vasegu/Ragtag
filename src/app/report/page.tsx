import type { Metadata } from "next";
import { ReportLoader } from "./ReportLoader";

export const metadata: Metadata = {
  title: "Report · One Hackney",
  description: "Snap a street problem, see where it sits in the queue and when it should be fixed.",
};

export default function ReportPage() {
  return <ReportLoader />;
}
