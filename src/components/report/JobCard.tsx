"use client";

import { useState } from "react";
import type { WorkOrder } from "@/features/street-brain/contracts";
import { IconWrench } from "./icons";

const MODE: Record<WorkOrder["deliveryMode"], { label: string; style: string }> = {
  "in-house": { label: "In-house crew", style: "bg-hackney-tint text-hackney" },
  contractor: { label: "Contractor", style: "bg-[#eef2ff] text-[#3b5bdb]" },
  refer: { label: "Refer to owner", style: "bg-[#e8f1fb] text-[#0b5cad]" },
};

/** A crew-ready work order from pipeline decision 5: what a worker needs on their phone. */
export function JobCard({ order, reference, address, title }: { order: WorkOrder; reference: string; address: string; title: string }) {
  const mode = MODE[order.deliveryMode];
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-[24px] bg-card shadow-card">
      <div className="flex items-start gap-3 bg-ink p-4 text-white">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-hackney-bright/20 text-hackney-lime">
          <IconWrench className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-hackney-lime">Job card · {reference}</p>
          <p className="mt-0.5 text-[16px] font-semibold leading-snug">{title}</p>
          <p className="mt-0.5 truncate text-[12px] text-white/60">{address}</p>
        </div>
      </div>

      <div className="border-b border-line bg-hackney-tint/50 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-hackney">Size: {order.size.band}</p>
        <p className="mt-0.5 text-[13.5px] font-medium leading-snug">{order.size.quantity}</p>
        <p className="text-[12px] leading-snug text-muted">{order.size.description}</p>
      </div>

      <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
        <Stat label="Trade" value={order.trade} />
        <Stat label="Crew" value={`${order.crewSize}`} />
        <Stat label="On site" value={`${order.estimatedMinutes.min}–${order.estimatedMinutes.max} min`} />
      </div>

      {!open && (
        <button onClick={() => setOpen(true)} className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-medium text-hackney hover:bg-hackney-tint/40">
          See the crew&apos;s full job card · {order.tasks.length} tasks
          <span aria-hidden>↓</span>
        </button>
      )}
      {open && <div className="space-y-3 p-4">
        <p className="text-[13px] leading-snug text-muted">{order.summary}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${mode.style}`}>{mode.label}</span>
          <span className="rounded-full bg-canvas px-2 py-0.5 font-mono text-[10px] text-muted">
            £{order.costRange.low}–£{order.costRange.high} est.
          </span>
          {order.afterPhotoRequired && <span className="rounded-full bg-canvas px-2 py-0.5 font-mono text-[10px] text-muted">After photo required</span>}
        </div>

        <Section title="Tasks">
          <ol className="space-y-1.5">
            {order.tasks.map((t, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-[1px] grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-2 border-line font-mono text-[10px] text-muted">{i + 1}</span>
                <span className="min-w-0 text-[13px] leading-snug">
                  <span className="font-semibold">{t.step}</span> <span className="text-muted">· {t.who}</span>
                  <span className="block text-muted">{t.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>

        {(order.materials.length > 0 || order.equipment.length > 0) && (
          <Section title="Bring">
            <div className="flex flex-wrap gap-1.5">
              {[...order.equipment, ...order.materials].map((x) => (
                <span key={x} className="rounded-full bg-canvas px-2.5 py-1 text-[12px]">
                  {x}
                </span>
              ))}
            </div>
          </Section>
        )}

        {(order.safety.length > 0 || order.trafficManagement) && (
          <Section title="Safety">
            <ul className="space-y-1 text-[12.5px] leading-snug text-muted">
              {order.trafficManagement && <li>Traffic: {order.trafficManagement}</li>}
              {order.safety.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Section>
        )}

        {order.confirmations.length > 0 && (
          <Section title="Supervisor confirms before dispatch">
            <ul className="space-y-1 text-[12.5px] leading-snug text-muted">
              {order.confirmations.map((c) => (
                <li key={c}>· {c}</li>
              ))}
            </ul>
          </Section>
        )}

        <p className="font-mono text-[9.5px] text-muted">Batch: {order.bundleKey} · planning estimates, not confirmed Hackney rates</p>
        <button onClick={() => setOpen(false)} className="text-[12.5px] font-medium text-muted underline underline-offset-2">
          Hide details
        </button>
      </div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-2.5">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="truncate text-[13px] font-semibold">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{title}</p>
      {children}
    </div>
  );
}
