"use client";

import dynamic from "next/dynamic";

// Mapbox and three.js need the browser.
const ReportApp = dynamic(() => import("@/components/report/ReportApp").then((m) => m.ReportApp), {
  ssr: false,
  loading: () => <div className="h-dvh w-full bg-[#0b1020]" />,
});

export function ReportLoader() {
  return <ReportApp />;
}
