import OpenAI from "openai";
import { setDefaultOpenAIClient, setTracingDisabled, setTracingExportApiKey } from "@openai/agents";

export const CHAT_MODEL = process.env.CHAT_MODEL ?? "openai/gpt-5.4-mini";
export const GUARD_MODEL = process.env.GUARD_MODEL ?? "openai/gpt-5.4-nano";
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small";

// Models go through Vercel AI Gateway for now. To use OpenAI directly, set
// OPENAI_API_KEY, unset AI_BASE_URL, and drop the "openai/" prefix from model names.
export const ai = new OpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_BASE_URL,
});

let configured = false;

export function configureAgents() {
  if (configured) return;
  configured = true;
  setDefaultOpenAIClient(ai);
  // Traces export to the OpenAI dashboard, which needs a real OpenAI key.
  if (process.env.OPENAI_API_KEY) setTracingExportApiKey(process.env.OPENAI_API_KEY);
  else setTracingDisabled(true);
}

export async function embed(text: string) {
  const res = await ai.embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return res.data[0].embedding;
}
