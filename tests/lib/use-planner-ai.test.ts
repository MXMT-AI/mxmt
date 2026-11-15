import { beforeEach, expect, it, vi } from "vitest";
import { usePlannerAi } from "@/components/planner/use-planner-ai";
import { requestPlannerAi } from "@/lib/client/planner-ai-request";
import { buildPlannerAiContext } from "@/components/planner/planner-ai-context";
import type { PlannerAiContext } from "@/components/planner/planner-ai-context";
const state = vi.hoisted(() => ({ values: [] as any[], index: 0, lock: { current: false } }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useRef: () => state.lock, useState: (initial: unknown) => {
  const index = state.index++;
  if (!(index in state.values)) state.values[index] = initial;
  return [state.values[index], (next: any) => { state.values[index] = typeof next === "function" ? next(state.values[index]) : next; }];
} }));
vi.mock("@/lib/client/planner-ai-request", () => ({ requestPlannerAi: vi.fn() }));
const context: PlannerAiContext = { brandCount: 0, itemCount: 0, cart: [], budgetStatus: [], totalCartItems: 0, totalSpent: 0, fmt: String };
function render(lang: "uk" | "en" = "uk") { state.index = 0; return usePlannerAi(lang, context); }
beforeEach(() => { state.values = []; state.lock.current = false; vi.clearAllMocks(); vi.mocked(requestPlannerAi).mockResolvedValue("Answer"); });
it("keeps message history and sends current context and locale", async () => {
  render().setInput("Question");
  await render().send();
  expect(render().messages).toEqual([{ role: "user", content: "Question" }, { role: "assistant", content: "Answer" }]);
  expect(render().input).toBe("");
  render().setInput("Next question");
  await render().send();
  expect(vi.mocked(requestPlannerAi).mock.calls[1][0]).toEqual({ locale: "uk", systemPrompt: buildPlannerAiContext(context), messages: [{ role: "user", content: "Question" }, { role: "assistant", content: "Answer" }, { role: "user", content: "Next question" }] });
});
it("blocks an immediate second send before React rerenders", async () => {
  let finish!: (content: string) => void;
  vi.mocked(requestPlannerAi).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render().setInput("Question");
  const chat = render();
  const pending = chat.send();
  await chat.send();
  expect(requestPlannerAi).toHaveBeenCalledTimes(1);
  expect(render().loading).toBe(true);
  finish("Answer"); await pending;
  expect(render().loading).toBe(false);
  expect(state.lock.current).toBe(false);
});
it("does not send blank input", async () => {
  render().setInput("   ");
  await render().send();
  expect(requestPlannerAi).not.toHaveBeenCalled();
  expect(render().messages).toEqual([]);
});
it.each(["uk", "en"] as const)("shows a localized failure and unlocks subsequent requests in %s", async lang => {
  vi.mocked(requestPlannerAi).mockRejectedValueOnce(new Error("private infrastructure error"));
  render(lang).setInput("Question");
  await render(lang).send();
  expect(render(lang).messages[1].content).toBe(lang === "uk" ? "Не вдалося отримати відповідь AI. Спробуйте ще раз." : "Error contacting AI. Please try again.");
  expect(render(lang).loading).toBe(false);
  render(lang).setInput("Retry");
  await render(lang).send();
  expect(render(lang).messages.at(-1)?.content).toBe("Answer");
});
it("builds the existing buying context from brand budgets and order lines", () => {
  const prompt = buildPlannerAiContext({ ...context, brandCount: 1, itemCount: 8, totalCartItems: 3, totalSpent: 30,
    budgetStatus: [{ id: "b", name: "Demo", budget: 100, paymentDays: 30, currency: "EUR", country: null, contact: null, leadTimeDays: 28, moq: 1, spent: 30, remaining: 70, pct: 30 }],
    cart: [{ catalogItemId: "i", sku: "SKU-1", name: "Item", brandId: "b", brandName: "Demo", category: "Shoes", price: 10, currency: "EUR", qty: 3, minOrder: 1 }],
  });
  expect(prompt).toContain("Brands: 1");
  expect(prompt).toContain("Catalog items: 8");
  expect(prompt).toContain("Cart: 1 lines, 3 units, €30 spent");
  expect(prompt).toContain("Demo: budget €100, spent €30, 30%");
  expect(prompt).toContain("Demo — Item (SKU-1) x3 @ EUR10");
});
