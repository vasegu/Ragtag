import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { error } = await supabase.auth.getSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">Ragtag</h1>
      <p className="text-lg">
        Supabase: {error ? `error (${error.message})` : "connected"}
      </p>
    </main>
  );
}
