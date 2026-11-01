import { config } from "dotenv";
import type { NextConfig } from "next";

// Local secrets (AI gateway key, Supabase secret key) live outside .env.local so that
// file stays safe to share. On Vercel these come from project env vars instead.
config({ path: ".env.secrets.local", quiet: true });

const nextConfig: NextConfig = {
  serverExternalPackages: ["@openai/agents"],
  outputFileTracingIncludes: {
    // Read at runtime by the street brain pipeline (policy, referral guide, resources).
    "/api/street-brain/**": [
      "./harvest/docs/severity-assessment-model.md",
      "./harvest/docs/responsibility-and-referral-guide.md",
      "./harvest/docs/available-resources.md",
      "./harvest/docs/resource-allocation-model.md",
    ],
  },
};

export default nextConfig;
