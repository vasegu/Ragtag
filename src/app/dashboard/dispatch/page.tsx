import type { Metadata } from "next";
import { OpsPage } from "../operations/OpsPage";

export const metadata: Metadata = { title: "Dispatch · One Hackney council workspace", description: "Crew routes, run sheets and real drive times for tomorrow." };
export const revalidate = 60;

export default function Page() {
  return <OpsPage view="dispatch" />;
}
