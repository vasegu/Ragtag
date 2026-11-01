import { seedReports } from "@/lib/report/seed";

// Seeded until Manjeev's FixMyStreet harvest lands (see AGENTS.md "Reports").
export async function GET() {
  return Response.json({ reports: seedReports() });
}
