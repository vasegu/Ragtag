import type { Metadata } from "next";
import { toHotspots } from "@/lib/council/hotspots";
import { opsData } from "@/lib/council/ops";
import { OpsLoader } from "./OpsLoader";

export const metadata: Metadata = {
  title: "Operations · One Hackney council workspace",
  description: "Hotspots with long-term fixes, and crew dispatch with efficient routes.",
};

export const revalidate = 60;

export default async function OperationsPage() {
  try {
    const d = await opsData();
    return <OpsLoader jobs={d.jobs} supply={d.supply} hotspots={toHotspots(d.heat)} withWorkOrders={d.withWorkOrders} error={null} />;
  } catch (err) {
    console.error(err);
    return <OpsLoader jobs={[]} supply={[]} hotspots={[]} withWorkOrders={0} error="Couldn't load operations data. Check the Supabase connection." />;
  }
}
