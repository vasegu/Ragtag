// Canned /api/chat?mock=1 response in the same event shape as the real stream,
// so the UI can be built without AI calls.
const ANSWER =
  "You can pay your Council Tax online, by Direct Debit, or by phone on the 24-hour payment line [1]. Setting up a Direct Debit is the easiest way, and you can choose to pay over 10 or 12 months [1][2].";

const SOURCES = [
  {
    n: 1,
    title: "Pay your Council Tax",
    heading: "Ways to pay",
    url: "https://hackney.gov.uk/council-tax-and-benefits/council-tax/pay-your-council-tax",
    kind: "page",
    serviceArea: "council-tax",
  },
  {
    n: 2,
    title: "Council Tax Direct Debit",
    heading: null,
    url: "https://hackney.gov.uk/council-tax-and-benefits/council-tax/direct-debit",
    kind: "page",
    serviceArea: "council-tax",
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function* mockStream(message: string) {
  const call = { type: "function_call", name: "search_hackney", callId: "mock", arguments: JSON.stringify({ query: message, service_area: null }) };
  yield { type: "run_item_stream_event", name: "tool_called", item: { type: "tool_call_item", rawItem: call } };
  await sleep(400);
  yield { type: "run_item_stream_event", name: "tool_output", item: { type: "tool_call_output_item", rawItem: { ...call, type: "function_call_result" }, output: "[1] Pay your Council Tax ..." } };
  for (const word of ANSWER.split(/(?<= )/)) {
    await sleep(25);
    yield { type: "raw_model_stream_event", data: { type: "output_text_delta", delta: word } };
  }
  yield {
    type: "done",
    history: [
      { role: "user", content: message },
      { role: "assistant", status: "completed", content: [{ type: "output_text", text: ANSWER }] },
    ],
    sources: SOURCES,
  };
}
