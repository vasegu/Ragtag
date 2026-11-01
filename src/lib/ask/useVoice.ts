"use client";

import { OpenAIRealtimeWebRTC, RealtimeAgent, type RealtimeItem, RealtimeSession, tool } from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

// Live voice for Ask: a realtime agent over WebRTC that searches the same Hackney index
// as the text chat (via /api/search) and speaks short, sourced answers.

export type VoiceSource = { title: string; url: string };
export type VoiceLine = { id: string; role: "user" | "assistant"; text: string };
export type VoiceStatus = "idle" | "connecting" | "live" | "error";

const INSTRUCTIONS = `You are One Hackney, the London Borough of Hackney's voice assistant for residents.
Speak naturally and briefly: one to three short sentences, then offer more detail if useful.
Always reply in the language the resident speaks.
Before answering any question about council services or rights, call search_hackney and answer only from what it returns. If it doesn't cover the question, say so and suggest calling Hackney on 020 8356 3000.
Never read out web addresses; say the page name and that the link is on their screen.
For street problems like fly-tipping, potholes or broken lights, suggest tapping the camera button to report it.
If asked about something unrelated to the council or public services, politely say you can only help with Hackney Council.`;

// A voice key fetched ahead of time, so tapping the mic skips a server round trip.
// Keys last 10 minutes and are used once; a fresh one is fetched after each use.
type VoiceKey = { key: string; model: string; expiresAt: number };
let readyKey: VoiceKey | null = null;
let pendingKey: Promise<VoiceKey> | null = null;

function fetchKey(): Promise<VoiceKey> {
  pendingKey ??= fetch("/api/realtime", { method: "POST" })
    .then(async (res) => {
      if (!res.ok) throw new Error((await res.json()).error ?? "Voice is unavailable");
      return (await res.json()) as VoiceKey;
    })
    .finally(() => {
      pendingKey = null;
    });
  return pendingKey;
}

/** Warm the voice key in the background. Safe to call often. */
export function prepareVoice() {
  if (readyKey && readyKey.expiresAt * 1000 - Date.now() > 60_000) return;
  fetchKey()
    .then((k) => (readyKey = k))
    .catch(() => {});
}

async function takeKey(): Promise<VoiceKey> {
  const k = readyKey && readyKey.expiresAt * 1000 - Date.now() > 30_000 ? readyKey : await fetchKey();
  readyKey = null;
  prepareVoice();
  return k;
}

export function useVoice() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [sources, setSources] = useState<VoiceSource[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [searching, setSearching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const session = useRef<RealtimeSession | null>(null);
  /** Live loudness 0-1 (the agent's voice while it speaks, otherwise the mic). Read every frame, no re-renders. */
  const level = useRef(0);
  const audio = useRef<{ ctx: AudioContext; mic: MediaStream; raf: number } | null>(null);
  const speakingRef = useRef(false);

  const releaseAudio = () => {
    if (!audio.current) return;
    cancelAnimationFrame(audio.current.raf);
    audio.current.mic.getTracks().forEach((t) => t.stop());
    audio.current.ctx.close();
    audio.current = null;
    level.current = 0;
  };

  const start = useCallback(async (context: { role: "user" | "assistant"; text: string }[] = []) => {
    if (session.current) return;
    setStatus("connecting");
    setError(null);
    setLines([]);
    setSources([]);
    try {
      // Mic permission and the voice key in parallel. The mic has a timeout because a
      // blocked prompt can hang instead of rejecting.
      const [mic, { key, model }] = await Promise.all([
        Promise.race([
          navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Microphone access was blocked.")), 12000)),
        ]),
        takeKey(),
      ]);

      // Loudness meters: one on the mic, one on the agent's voice once its track arrives.
      const ctx = new AudioContext();
      const meter = (node: AudioNode) => {
        const a = ctx.createAnalyser();
        a.fftSize = 512;
        node.connect(a);
        return a;
      };
      const micMeter = meter(ctx.createMediaStreamSource(mic));
      const audioElement = new Audio();
      audioElement.autoplay = true;
      let outMeter: AnalyserNode | null = null;
      const buf = new Uint8Array(512);
      const rms = (a: AnalyserNode) => {
        a.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        return Math.sqrt(sum / buf.length);
      };
      const tick = () => {
        if (!outMeter && audioElement.srcObject instanceof MediaStream && audioElement.srcObject.getAudioTracks().length) {
          outMeter = meter(ctx.createMediaStreamSource(audioElement.srcObject));
        }
        const raw = speakingRef.current && outMeter ? rms(outMeter) * 4 : rms(micMeter) * 3;
        level.current += (Math.min(1, raw) - level.current) * 0.35;
        audio.current!.raf = requestAnimationFrame(tick);
      };
      audio.current = { ctx, mic, raf: requestAnimationFrame(tick) };


      const searchHackney = tool({
        name: "search_hackney",
        description: "Search Hackney Council's website and national guidance. Returns excerpts with page titles.",
        parameters: z.object({ query: z.string().describe("Search query in English") }),
        execute: async ({ query }) => {
          setSearching(query);
          try {
            const r = await fetch(`/api/search?q=${encodeURIComponent(query)}&count=5`);
            const { results } = (await r.json()) as { results: { title: string; url: string; content: string }[] };
            setSources((prev) => {
              const seen = new Set(prev.map((s) => s.url));
              return [...prev, ...results.filter((x) => !seen.has(x.url)).slice(0, 3).map((x) => ({ title: x.title, url: x.url }))];
            });
            return results.map((x) => `${x.title}: ${x.content.slice(0, 700)}`).join("\n\n---\n\n") || "No results.";
          } finally {
            setSearching(null);
          }
        },
      });

      // Carry on from the text chat: the last few exchanges go into the instructions.
      const recent = context.slice(-8).map((l) => `${l.role === "user" ? "Resident" : "You"}: ${l.text.replace(/\[\d+\]/g, "").slice(0, 600)}`);
      const instructions = recent.length
        ? `${INSTRUCTIONS}\n\nThe resident was just typing to you and switched to voice. Continue the same conversation; don't greet them again or repeat what you already said.\nConversation so far:\n${recent.join("\n")}`
        : INSTRUCTIONS;
      const agent = new RealtimeAgent({ name: "One Hackney", instructions, tools: [searchHackney] });
      const s = new RealtimeSession(agent, { model, transport: new OpenAIRealtimeWebRTC({ mediaStream: mic, audioElement }) });
      s.on("history_updated", (history: RealtimeItem[]) => setLines(toLines(history)));
      s.on("audio_start", () => {
        speakingRef.current = true;
        setSpeaking(true);
      });
      s.on("audio_stopped", () => {
        speakingRef.current = false;
        setSpeaking(false);
      });
      s.on("error", (e) => console.error("voice error", e));
      await s.connect({ apiKey: key });
      session.current = s;
      setStatus("live");
    } catch (e) {
      session.current = null;
      releaseAudio();
      setStatus("error");
      setError(e instanceof Error && /permission|NotAllowed/i.test(e.message) ? "Microphone access was blocked." : e instanceof Error ? e.message : "Voice failed to start.");
    }
  }, []);

  const toggleMute = useCallback(() => {
    const s = session.current;
    if (!s) return;
    const next = !muted;
    s.mute(next);
    setMuted(next);
  }, [muted]);

  const stop = useCallback(() => {
    session.current?.close();
    session.current = null;
    releaseAudio();
    speakingRef.current = false;
    setMuted(false);
    setSpeaking(false);
    setSearching(null);
    setStatus("idle");
  }, []);

  useEffect(
    () => () => {
      session.current?.close();
      releaseAudio();
    },
    [],
  );

  return { status, lines, sources, speaking, searching, error, level, muted, start, stop, toggleMute };
}

function toLines(history: RealtimeItem[]): VoiceLine[] {
  const out: VoiceLine[] = [];
  for (const item of history) {
    if (item.type !== "message" || (item.role !== "user" && item.role !== "assistant")) continue;
    const text = item.content
      .map((c) => ("transcript" in c ? (c.transcript ?? "") : "text" in c ? c.text : ""))
      .join(" ")
      .trim();
    if (text) out.push({ id: item.itemId, role: item.role, text });
  }
  return out;
}
