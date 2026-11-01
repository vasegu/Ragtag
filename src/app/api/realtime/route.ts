export const runtime = "nodejs";

const REALTIME_MODEL = process.env.REALTIME_MODEL ?? "gpt-realtime-2.1";

// Mints a short-lived client key for the browser's voice session (WebRTC straight to OpenAI).
// The real OPENAI_API_KEY never leaves the server. Realtime needs OpenAI directly, not the gateway.
export async function POST() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "Voice needs OPENAI_API_KEY on the server" }, { status: 503 });

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: { type: "realtime", model: REALTIME_MODEL },
    }),
  });
  if (!res.ok) {
    console.error("realtime client secret failed", res.status, await res.text());
    return Response.json({ error: "Could not start a voice session" }, { status: 502 });
  }
  const data = (await res.json()) as { value: string; expires_at: number };
  return Response.json({ key: data.value, expiresAt: data.expires_at, model: REALTIME_MODEL });
}
