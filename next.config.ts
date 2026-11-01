import { config } from "dotenv";
import type { NextConfig } from "next";

// Local secrets (AI gateway key, Supabase secret key) live outside .env.local so that
// file stays safe to share. On Vercel these come from project env vars instead.
config({ path: ".env.secrets.local", quiet: true });

const nextConfig: NextConfig = {
  serverExternalPackages: ["@openai/agents"],
  outputFileTracingIncludes: { "/api/street-brain/**": ["./harvest/docs/severity-assessment-model.md"] },
};

export default nextConfig;
