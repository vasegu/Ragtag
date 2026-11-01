"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Reward, usePlayer } from "@/lib/report/game";
import { CATEGORY_META, type Classification, DEMO_LOCATION, type LatLng, type QueueInfo, type Report } from "@/lib/report/types";
import type { MascotKind } from "./Mascot";
import { NightMap } from "./NightMap";
import { BadgesScreen, BoardScreen, CaptureScreen, HomeScreen, RewardOverlay, ScanScreen, StreakSheet, TrackerScreen, VerifySheet } from "./screens";
import { AskTab, FrontDoor, NearbyTab, type Tab, TabBar } from "./tabs";
import { IconMoon, IconSun } from "./icons";
import { PhoneFrame, useIsPhone } from "./ui";
import { buildTrack } from "@/lib/report/track";
import { prepareVoice } from "@/lib/ask/useVoice";
import { type PipelineResult, assessPhoto } from "@/lib/report/pipeline";

const HackneyGame = dynamic(() => import("@/components/game/HackneyGame"), { ssr: false });

const HAS_MAPBOX = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

type Screen = "tabs" | "capture" | "scan" | "tracker" | "badges" | "board";

const HACKNEY_BOUNDS = { minLat: 51.517, maxLat: 51.578, minLng: -0.107, maxLng: -0.014 };

/** Phone photos are 3-5MB; the classifier only needs ~1024px. Shrinks to JPEG before upload. */
async function shrink(file: File, max = 1024): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}

function metres(a: LatLng, b: LatLng) {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

export function ReportApp() {
  const { player, act, reset } = usePlayer();
  const isPhone = useIsPhone();
  const [mascot, setMascot] = useState<MascotKind>("fields");
  const [mapStyle, setMapStyle] = useState<"mapbox" | "game">(HAS_MAPBOX ? "mapbox" : "game");
  // Day/night follows the clock by default (7am to 7pm is day); the panel can override it.
  const [theme, setTheme] = useState<"night" | "day">(() => {
    const h = new Date().getHours();
    return h >= 7 && h < 19 ? "day" : "night";
  });
  const [screen, setScreen] = useState<Screen>("tabs");
  const [tab, setTab] = useState<Tab>("home");
  // A question started from Home (search bar or quick tile), sent when the Ask tab opens.
  const [askSeed, setAskSeed] = useState<string | null>(null);
  const [voiceRequest, setVoiceRequest] = useState(0);
  const [reports, setReports] = useState<Report[]>([]);
  const [location, setLocation] = useState<LatLng>(DEMO_LOCATION);
  const [address, setAddress] = useState("London Fields, Hackney E8");
  const [focus, setFocus] = useState<LatLng | null>(null);
  const [dropped, setDropped] = useState<(LatLng & { category: Report["category"] }) | null>(null);

  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [classification, setClassification] = useState<Classification | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [queue, setQueue] = useState<QueueInfo | null>(null);
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState<Report | null>(null);
  const [reward, setReward] = useState<Reward | null>(null);
  const [verifying, setVerifying] = useState<Report | null>(null);
  // Santiago's street brain pipeline, run alongside the quick classifier.
  const [pipeline, setPipeline] = useState<{ result: PipelineResult | null; running: boolean; error: string | null }>({ result: null, running: false, error: null });
  const [streakOpen, setStreakOpen] = useState(false);

  // Voice: get a key ready so the mic connects quickly.
  useEffect(() => prepareVoice(), []);

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => r.json())
      .then((d: { reports: Report[] }) => setReports(d.reports));
  }, []);

  // Real GPS when it's inside Hackney; otherwise stay at the London Fields demo spot.
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        const inside = here.lat > HACKNEY_BOUNDS.minLat && here.lat < HACKNEY_BOUNDS.maxLat && here.lng > HACKNEY_BOUNDS.minLng && here.lng < HACKNEY_BOUNDS.maxLng;
        if (inside) setLocation(here);
      },
      () => {},
      { timeout: 5000 },
    );
  }, []);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;
    fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${location.lng}&latitude=${location.lat}&types=address,street&limit=1&access_token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        const p = d.features?.[0]?.properties;
        if (p) setAddress([p.name, p.context?.postcode?.name].filter(Boolean).join(", "));
      })
      .catch(() => {});
  }, [location]);

  const quests = useMemo(
    () =>
      reports
        .filter((r) => r.status === "open" && r.confirmations < 3)
        .map((r) => ({ ...r, distance: metres(location, r) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 6),
    [reports, location],
  );
  const questIds = useMemo(() => quests.map((q) => q.id), [quests]);
  const nearby = useMemo(() => reports.map((r) => ({ ...r, distance: metres(location, r) })).sort((a, b) => a.distance - b.distance), [reports, location]);
  const active = useMemo(
    () => (submitted ? { report: submitted, track: buildTrack(submitted, reports, { classification }) } : null),
    [submitted, reports, classification],
  );
  const stats = useMemo(() => {
    const open = reports.filter((r) => r.status !== "fixed").length;
    const fixed = reports.filter((r) => r.status === "fixed").length;
    return { open, fixed };
  }, [reports]);

  const startScan = useCallback(
    async (file: File, preview: string) => {
      setPhoto({ file, preview });
      setClassification(null);
      setScanError(null);
      setScreen("scan");
      setFocus({ ...location });
      const small = await shrink(file);
      setPipeline({ result: null, running: true, error: null });
      assessPhoto(small, { address, description: "Photo report from One Hackney. Please assess what the photo shows.", lat: location.lat, lng: location.lng })
        .then((result) => setPipeline({ result, running: false, error: null }))
        .catch((e: Error) => setPipeline({ result: null, running: false, error: e.message }));
      const form = new FormData();
      form.append("photo", small, "photo.jpg");
      form.append("lat", String(location.lat));
      form.append("lng", String(location.lng));
      try {
        // Keep the scan on screen long enough to read, even when the model is fast.
        const [res] = await Promise.all([fetch("/api/classify", { method: "POST", body: form }), new Promise((r) => setTimeout(r, 1200))]);
        if (!res.ok) throw new Error();
        setClassification((await res.json()) as Classification);
      } catch {
        setScanError("We couldn't read that photo. Try another angle, or pick the category yourself.");
      }
    },
    [location, address],
  );

  const submit = useCallback(async () => {
    if (!classification) return;
    setSubmitting(true);
    const id = `app-${Date.now()}`;
    const report: Report = {
      id,
      ...location,
      category: classification.category,
      status: "open",
      title: `${CATEGORY_META[classification.category].label}, ${address.split(",")[0]}`,
      created_at: new Date().toISOString(),
      source: "app",
      confirmations: 0,
      photo_url: photo?.preview,
    };
    const res = await fetch("/api/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ report, classification }),
    });
    const q = (await res.json()) as QueueInfo;
    setReports((r) => [...r, report]);
    setDropped({ ...location, category: classification.category });
    setSubmitted(report);
    setQueue(q);
    setReference(`HN-${String(Date.now()).slice(-5)}`);
    setReward(act({ type: "report", id, category: classification.category }));
    setSubmitting(false);
    setScreen("tracker");
  }, [classification, location, address, photo, act]);

  const answerQuest = (report: Report, answer: "there" | "fixed") => {
    setReports((all) =>
      all.map((r) => (r.id === report.id ? { ...r, confirmations: r.confirmations + (answer === "there" ? 1 : 0), status: answer === "fixed" ? "fixed" : r.status } : r)),
    );
    setVerifying(null);
    setReward(act({ type: "verify" }));
  };

  const openReport = (r: Report) => {
    setFocus({ lat: r.lat, lng: r.lng });
    setVerifying(r);
  };

  const ask = (q?: string) => {
    if (q) setAskSeed(q);
    setTab("ask");
    setScreen("tabs");
  };

  const home = () => {
    setScreen("tabs");
    setFocus(null);
  };

  return (
    <div className={`relative h-dvh w-full overflow-hidden ${theme === "day" ? "bg-canvas" : "bg-[#141a24]"}`}>
      <div className={`absolute inset-0 ${isPhone ? "hidden" : ""}`}>
        {mapStyle !== "game" ? (
          <NightMap
            reports={reports}
            focus={focus}
            dropped={dropped}
            questIds={questIds}
            theme={theme}
            onSelect={openReport}
          />
        ) : (
          <HackneyGame
            reports={reports}
            focus={focus}
            theme={theme}
            onSelect={(id) => {
              const r = reports.find((x) => x.id === id);
              if (r) openReport(r);
            }}
          />
        )}
      </div>

      {/* Desktop overlay: title, live counts, mascot picker. */}
      <div className="pointer-events-none absolute right-6 top-6 z-20 hidden w-[300px] space-y-3 md:block">
        <div className="pointer-events-auto rounded-[24px] bg-black/55 p-5 text-white backdrop-blur-xl ring-1 ring-white/10">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-hackney-lime">One Hackney</p>
          <p className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em]">One app for the council. Ask anything, report anything, see it fixed.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[28px] font-semibold tabular-nums tracking-[-0.03em]">{stats.open}</p>
              <p className="text-[12px] text-white/60">open in Hackney</p>
            </div>
            <div>
              <p className="text-[28px] font-semibold tabular-nums tracking-[-0.03em]">{stats.fixed}</p>
              <p className="text-[12px] text-white/60">fixed recently</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {Object.entries(CATEGORY_META).map(([k, m]) => (
              <span key={k} className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11.5px]">
                <span className="h-2 w-2 rounded-full" style={{ background: m.colour, boxShadow: `0 0 8px ${m.colour}` }} />
                {m.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11.5px]">
              <span className="h-2 w-2 rounded-full ring-2 ring-hackney-lime" />
              Quest
            </span>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center justify-between rounded-[20px] bg-black/55 p-3 text-white backdrop-blur-xl ring-1 ring-white/10">
          <span className="pl-2 text-[12.5px] text-white/70">Mascot</span>
          <div className="flex gap-1">
            {(["fields", "fox"] as const).map((m) => (
              <button key={m} onClick={() => setMascot(m)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${mascot === m ? "bg-white text-ink" : "text-white/70 hover:text-white"}`}>
                {m === "fields" ? "London Fields" : "Fox"}
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-auto flex items-center justify-between rounded-[20px] bg-black/55 p-3 text-white backdrop-blur-xl ring-1 ring-white/10">
          <span className="pl-2 text-[12.5px] text-white/70">Map</span>
          <div className="flex gap-1">
            {(["mapbox", "game"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMapStyle(m)}
                disabled={m !== "game" && !HAS_MAPBOX}
                title={m !== "game" && !HAS_MAPBOX ? "Set NEXT_PUBLIC_MAPBOX_TOKEN" : undefined}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-40 ${mapStyle === m ? "bg-white text-ink" : "text-white/70 hover:text-white"}`}
              >
                {m === "mapbox" ? "3D" : "Game"}
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-auto flex items-center justify-between rounded-[20px] bg-black/55 p-3 text-white backdrop-blur-xl ring-1 ring-white/10">
          <span className="pl-2 text-[12.5px] text-white/70">Time</span>
          <div className="flex gap-1">
            {(["day", "night"] as const).map((t) => (
              <button key={t} onClick={() => setTheme(t)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${theme === t ? "bg-white text-ink" : "text-white/70 hover:text-white"}`}>
                <span className="flex items-center gap-1.5">
                  {t === "day" ? <IconSun className="h-3.5 w-3.5" /> : <IconMoon className="h-3.5 w-3.5" />}
                  {t === "day" ? "Day" : "Night"}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <Link href="/report/game" className="flex-1 rounded-[16px] bg-black/55 px-4 py-2.5 text-center text-[13px] font-medium text-white backdrop-blur-xl ring-1 ring-white/10 hover:bg-black/70">
            Game mode →
          </Link>
          <button onClick={reset} className="rounded-[16px] bg-black/55 px-4 py-2.5 text-[13px] text-white/70 backdrop-blur-xl ring-1 ring-white/10 hover:text-white">
            Reset demo
          </button>
        </div>
      </div>

      <div className={`pointer-events-none relative z-10 flex h-full items-center ${isPhone ? "" : "pl-5 md:pl-10"}`}>
        <PhoneFrame>
          <div className={`h-full ${screen === "tabs" && tab === "ask" ? "overflow-hidden" : "overflow-y-auto"} ${isPhone ? "pt-2" : "pt-[54px]"}`}>
            {screen === "tabs" && tab === "home" && (
              <FrontDoor
                player={player}
                mascot={mascot}
                active={active}
                quests={quests}
                onAsk={ask}
                onVoice={() => {
                  setVoiceRequest((n) => n + 1);
                  setTab("ask");
                }}
                onReport={() => setScreen("capture")}
                onOpen={(r) => (submitted && r.id === submitted.id ? setScreen("tracker") : openReport(r))}
                onTab={setTab}
              />
            )}
            {screen === "tabs" && tab === "ask" && <AskTab initial={askSeed} voiceRequest={voiceRequest} mascot={mascot} onReport={() => setScreen("capture")} />}
            {screen === "tabs" && tab === "nearby" && <NearbyTab reports={nearby} onOpen={openReport} />}
            {screen === "tabs" && tab === "me" && (
              <HomeScreen
                player={player}
                mascot={mascot}
                quests={quests}
                onReport={() => setScreen("capture")}
                onQuest={openReport}
                onTab={(t) => setScreen(t)}
                onStreak={() => setStreakOpen(true)}
              />
            )}
            {screen === "capture" && <CaptureScreen address={address} onPhoto={startScan} onBack={home} />}
            {screen === "scan" && photo && (
              <ScanScreen
                preview={photo.preview}
                mascot={mascot}
                classification={classification}
                error={scanError}
                submitting={submitting}
                pipeline={{ trace: pipeline.result?.trace ?? null, running: pipeline.running, error: pipeline.error }}
                onSubmit={submit}
                onBack={() => setScreen("capture")}
              />
            )}
            {screen === "tracker" && queue && classification && submitted && (
              <TrackerScreen queue={queue} classification={classification} report={submitted} all={reports} workOrder={pipeline.result?.workOrder ?? null} mascot={mascot} reference={reference} onDone={home} />
            )}
            {screen === "badges" && <BadgesScreen player={player} onBack={home} />}
            {screen === "board" && <BoardScreen player={player} onBack={home} />}
          </div>

          {screen === "tabs" && <TabBar tab={tab} onTab={setTab} onReport={() => setScreen("capture")} />}
          {streakOpen && <StreakSheet player={player} onClose={() => setStreakOpen(false)} />}
          {verifying && <VerifySheet report={verifying} all={reports} onAnswer={(a) => answerQuest(verifying, a)} onClose={() => setVerifying(null)} />}
          {reward && <RewardOverlay reward={reward} player={player} mascot={mascot} onClose={() => setReward(null)} />}
        </PhoneFrame>
      </div>
    </div>
  );
}
