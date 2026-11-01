import { toHotspots } from "@/lib/council/hotspots";
import { opsData } from "@/lib/council/ops";
import type { View } from "@/components/council/OpsWorkspace";
import { OpsLoader } from "./OpsLoader";

// Server half of the Dispatch and Hotspots pages: live jobs, supply units and heat cells.
export async function OpsPage({ view }: { view: View }) {
  try {
    const d = await opsData();
    return <OpsLoader view={view} jobs={d.jobs} supply={d.supply} hotspots={toHotspots(d.heat)} withWorkOrders={d.withWorkOrders} error={null} />;
  } catch (err) {
    console.error(err);
    return <OpsLoader view={view} jobs={[]} supply={[]} hotspots={[]} withWorkOrders={0} error="Couldn't load operations data. Check the Supabase connection." />;
  }
}
