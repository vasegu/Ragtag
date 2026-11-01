import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only client with the secret key: bypasses RLS. Never import from client code.
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
}
