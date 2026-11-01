"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { OpsWorkspace as Workspace } from "@/components/council/OpsWorkspace";

// The map needs the browser.
const OpsWorkspace = dynamic(() => import("@/components/council/OpsWorkspace").then((m) => m.OpsWorkspace), {
  ssr: false,
  loading: () => <div className="h-dvh w-full bg-canvas" />,
});

export function OpsLoader(props: ComponentProps<typeof Workspace>) {
  return <OpsWorkspace {...props} />;
}
