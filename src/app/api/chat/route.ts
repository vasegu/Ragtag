import { type AgentInputItem, InputGuardrailTripwireTriggered, run, user } from "@openai/agents";
import { type AskContext, REFUSAL, askAgent } from "@/lib/agent";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockStream } from "./mock";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = { message: string; history?: AgentInputItem[] };

// Streams newline-delimited JSON: Agents SDK events as-is (text deltas and run items),
// then {"type":"done","history":[...],"sources":[...]}. See AGENTS.md for the contract.
export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  if (!body.message?.trim()) return Response.json({ error: "message is required" }, { status: 400 });
  if (new URL(req.url).searchParams.has("mock")) return ndjson(mockStream(body.message));

  const context: AskContext = { sources: [], areas: [] };
  const input: AgentInputItem[] = [...(body.history ?? []), user(body.message)];

  return ndjson(
    (async function* () {
      let text = "";
      try {
        const result = await run(askAgent(), input, { stream: true, context });
        for await (const event of result) {
          if (event.type === "raw_model_stream_event") {
            if (event.data.type !== "output_text_delta") continue;
            text += event.data.delta;
            yield { type: event.type, data: { type: event.data.type, delta: event.data.delta } };
          } else if (event.type === "run_item_stream_event") {
            yield { type: event.type, name: event.name, item: event.item.toJSON() };
          }
        }
        await result.completed;
        yield { type: "done", history: result.history, sources: context.sources, areas: context.areas };
      } catch (err) {
        if (!(err instanceof InputGuardrailTripwireTriggered)) throw err;
        text = REFUSAL;
        yield { type: "raw_model_stream_event", data: { type: "output_text_delta", delta: REFUSAL } };
        yield { type: "done", history: input, sources: [], refused: true };
      }
      await logQuestion(body.message, text, context);
    })(),
  );
}

async function logQuestion(question: string, answer: string, context: AskContext) {
  const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const { error } = await createAdminClient()
    .from("questions")
    .insert({
      question,
      service_area: context.areas[0] ?? null,
      answered: cited.size > 0 && !answer.startsWith("I couldn't find"),
      cited_urls: context.sources.filter((s) => cited.has(s.n)).map((s) => s.url),
    });
  if (error) console.error("question log failed:", error.message);
}

function ndjson(events: AsyncGenerator<unknown>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      } catch (err) {
        console.error(err);
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message: "Something went wrong" })}\n`));
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache" },
  });
}
