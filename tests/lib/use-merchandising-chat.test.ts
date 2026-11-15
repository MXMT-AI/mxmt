import type { FormEvent } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useMerchandisingChat } from "@/components/merchandising/use-merchandising-chat";
import { apiFetch } from "@/lib/fetch";

const harness = vi.hoisted(() => ({ values: [] as any[], refs: [] as any[], stateIndex: 0, refIndex: 0, cleanup: undefined as undefined | (() => void) }));
vi.mock("react", async load => ({
  ...await load<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.stateIndex++;
    if (!(index in harness.values)) harness.values[index] = initial;
    return [harness.values[index], (next: any) => { harness.values[index] = typeof next === "function" ? next(harness.values[index]) : next; }];
  },
  useRef: (initial: unknown) => {
    const index = harness.refIndex++;
    return harness.refs[index] ??= { current: initial };
  },
  useEffect: (effect: () => (() => void)) => { harness.cleanup ??= effect(); },
}));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const args = { snapshotId: "frozen", filters: {}, lang: "uk" as const, allowed: true, topic: "sales" as const, scenarioExportId: "export-1" };
const event = { preventDefault: vi.fn() } as unknown as FormEvent;
const reply = { mode: "generated", executionId: "run-1", cards: [], context: { snapshotId: "frozen" } };
function render(overrides = {}) {
  harness.stateIndex = 0;
  harness.refIndex = 0;
  return useMerchandisingChat({ ...args, ...overrides });
}
function ask(question = " Sales? ", overrides = {}) {
  render(overrides).setQuestion(question);
  const chat = render(overrides);
  chat.submit(event);
  return chat;
}
beforeEach(() => {
  harness.values = []; harness.refs = []; harness.cleanup = undefined;
  vi.mocked(apiFetch).mockReset().mockResolvedValue(Response.json(reply));
});

it("locks concurrent requests and retries the same body without duplicating the turn or history", async () => {
  let release!: (response: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  const chat = ask();
  chat.submit(event);
  chat.retry();
  expect(apiFetch).toHaveBeenCalledTimes(1);
  const first = JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
  expect(first).toMatchObject({ question: "Sales?", snapshotId: "frozen", scenarioExportId: "export-1", history: [] });
  release(Response.json(reply));
  await vi.waitFor(() => expect(render().busy).toBe(false));
  render().retry();
  await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(render().busy).toBe(false));
  expect(JSON.parse(vi.mocked(apiFetch).mock.calls[1][1]!.body as string)).toEqual(first);
  expect(render().turns).toHaveLength(1);
  ask("Next?");
  const next = JSON.parse(vi.mocked(apiFetch).mock.calls[2][1]!.body as string);
  expect(next.history).toEqual([{ executionId: "run-1", question: "Sales?", topic: "sales" }]);
  await vi.waitFor(() => expect(render().busy).toBe(false));
});

it("aborts on unmount and ignores a delayed reply", async () => {
  let release!: (response: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  ask();
  const signal = vi.mocked(apiFetch).mock.calls[0][1]!.signal!;
  harness.cleanup!();
  expect(signal.aborted).toBe(true);
  release(Response.json(reply));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(render().turns[0].reply).toBeUndefined();
  expect(render().error).toBe("");
});

it("blocks viewers and empty questions", () => {
  ask("Question", { allowed: false });
  expect(apiFetch).not.toHaveBeenCalled();
  ask("   ");
  expect(render().error).toBe("AI_CHAT_EMPTY_QUESTION");
  expect(apiFetch).not.toHaveBeenCalled();
});

it("limits the dialog to six turns and clears it for a fresh conversation", async () => {
  for (let i = 0; i < 6; i++) {
    ask(`Question ${i}`);
    await vi.waitFor(() => expect(render().busy).toBe(false));
  }
  ask("Seventh");
  expect(apiFetch).toHaveBeenCalledTimes(6);
  render().reset();
  expect(render()).toMatchObject({ turns: [], question: "", error: "" });
  render().retry();
  expect(apiFetch).toHaveBeenCalledTimes(6);
});

it("rejects replies from another snapshot and can retry the failed request", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ ...reply, context: { snapshotId: "other" } }));
  ask();
  await vi.waitFor(() => expect(render().error).toBe("AI_CHAT_CONNECTION_ERROR"));
  expect(render().turns[0].reply).toBeUndefined();
  render().retry();
  await vi.waitFor(() => expect(render().turns[0].reply).toBeDefined());
  expect(render().turns).toHaveLength(1);
});
