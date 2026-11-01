import { z } from "zod";
import { CHAT_MODEL, ai } from "@/lib/ai";
import { CATEGORIES, type Classification } from "@/lib/report/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const ClassificationSchema = z.object({
  category: z.enum(CATEGORIES),
  severity: z.number().min(1).max(5),
  safety: z.number().min(0).max(1),
  exposure: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  labels: z.array(z.string()).max(6),
});

const PROMPT = `You classify photos of street problems reported by residents of Hackney, London.
Return JSON: {"category": one of ${CATEGORIES.join(" | ")}, "severity": 1-5 (1 cosmetic, 5 dangerous),
"safety": 0-1 risk to people, "exposure": 0-1 how many people pass it (busy road, school, bus stop, cycle lane visible),
"confidence": 0-1, "labels": 2-4 short findings a resident would understand, e.g. "Deeper than 40mm", "Water pooling", "In a cycle lane", "Blocking the pavement"}.
If the photo shows none of these, pick the closest category with low confidence.`;

// Santiago's classifier when CLASSIFIER_URL is set; otherwise an OpenAI vision fallback with the same contract.
export async function POST(req: Request) {
  const form = await req.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File)) return Response.json({ error: "photo is required" }, { status: 400 });

  if (process.env.CLASSIFIER_URL) {
    const res = await fetch(process.env.CLASSIFIER_URL, { method: "POST", body: form });
    if (!res.ok) return Response.json({ error: `classifier ${res.status}` }, { status: 502 });
    return Response.json(ClassificationSchema.parse(await res.json()) satisfies Classification);
  }

  const dataUrl = `data:${photo.type || "image/jpeg"};base64,${Buffer.from(await photo.arrayBuffer()).toString("base64")}`;
  const res = await ai.chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: [{ type: "image_url", image_url: { url: dataUrl, detail: "low" } }] },
    ],
  });
  const parsed = ClassificationSchema.safeParse(JSON.parse(res.choices[0].message.content ?? "{}"));
  if (!parsed.success) return Response.json({ error: "could not classify" }, { status: 502 });
  return Response.json(parsed.data satisfies Classification);
}
