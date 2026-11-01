import type { Metadata } from "next";
import { AskChat } from "@/components/ask/AskChat";

export const metadata: Metadata = {
  title: "Ask · One Hackney",
  description: "Ask Hackney Council anything, in any language, and get an answer with sources.",
};

export default function AskPage() {
  return <AskChat />;
}
