"use client";

import { useCallback, useRef, useState } from "react";

/** Mirrors `Source` in src/lib/agent.ts (kept separate so client code doesn't import the agent). */
export type Source = {
  n: number;
  title: string;
  heading: string | null;
  url: string;
  kind: "page" | "pdf" | "national";
  serviceArea: string | null;
};

export type Turn =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      searches: string[];
      sources: Source[];
      status: "thinking" | "streaming" | "done" | "error";
      refused?: boolean;
    };

type StreamEvent =
  | { type: "raw_model_stream_event"; data: { type: "output_text_delta"; delta: string } }
  | { type: "run_item_stream_event"; name: string; item: { rawItem?: { type?: string; name?: string; arguments?: string } } }
  | { type: "done"; history: unknown[]; sources: Source[]; refused?: boolean }
  | { type: "error"; message: string };

const id = () => Math.random().toString(36).slice(2);

/** Client for POST /api/chat: streams NDJSON events into a list of turns. */
export function useAsk({ mock = false } = {}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const history = useRef<unknown[]>([]);

  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || busy) return;
      setBusy(true);
      const assistantId = id();
      setTurns((t) => [
        ...t,
        { id: id(), role: "user", text },
        { id: assistantId, role: "assistant", text: "", searches: [], sources: [], status: "thinking" },
      ]);
      const update = (fn: (turn: Extract<Turn, { role: "assistant" }>) => Partial<Turn>) =>
        setTurns((all) =>
          all.map((turn) => (turn.id === assistantId && turn.role === "assistant" ? ({ ...turn, ...fn(turn) } as Turn) : turn)),
        );

      try {
        const res = await fetch(`/api/chat${mock ? "?mock=1" : ""}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, history: history.current }),
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as StreamEvent;
            if (event.type === "raw_model_stream_event") {
              update((turn) => ({ text: turn.text + event.data.delta, status: "streaming" }));
            } else if (event.type === "run_item_stream_event" && event.name === "tool_called") {
              const raw = event.item.rawItem;
              if (raw?.name !== "search_hackney") continue;
              const query = (() => {
                try {
                  return JSON.parse(raw.arguments ?? "{}").query as string;
                } catch {
                  return "";
                }
              })();
              if (query) update((turn) => ({ searches: [...turn.searches, query] }));
            } else if (event.type === "done") {
              history.current = event.history;
              update(() => ({ sources: event.sources, status: "done", refused: event.refused }));
            } else if (event.type === "error") {
              update(() => ({ status: "error" }));
            }
          }
        }
      } catch {
        update(() => ({ status: "error" }));
      } finally {
        setBusy(false);
      }
    },
    [busy, mock],
  );

  const reset = useCallback(() => {
    history.current = [];
    setTurns([]);
  }, []);

  return { turns, busy, send, reset };
}
