import { fixMyStreetReports } from "@/lib/report/fixmystreet";
import { seedReports } from "@/lib/report/seed";

export const revalidate = 60;

// Real FixMyStreet reports from Manjeev's harvest; seeded data only if the harvest is unavailable.
export async function GET() {
  try {
    const reports = await fixMyStreetReports();
    if (reports.length) return Response.json({ reports, source: "fixmystreet" });
  } catch (err) {
    console.error(err);
  }
  return Response.json({ reports: seedReports(), source: "seed" });
}
