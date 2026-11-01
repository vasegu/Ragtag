import type { Metadata } from "next";
import { OpsPage } from "../operations/OpsPage";

export const metadata: Metadata = { title: "Hotspots · One Hackney council workspace", description: "Repeat problem places and the long-term fix for each." };
export const revalidate = 60;

export default function Page() {
  return <OpsPage view="hotspots" />;
}
