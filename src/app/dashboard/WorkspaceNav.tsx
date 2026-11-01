import { CouncilNav } from "@/components/council/CouncilNav";

// Kept as the dashboard pages' entry point; the shared council sidebar lives in CouncilNav.
export default function WorkspaceNav({ active, pending, onReset, ready = true }: { active: "overview" | "repairs" | "schedule"; pending?: number; onReset?: () => void; ready?: boolean }) {
  return <CouncilNav active={active} counts={pending ? { overview: { n: pending, tone: "terra" } } : {}} onReset={onReset} ready={ready} />;
}
