import { isValidElement, useRef, useState, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import OnboardingForm from "@/components/settings/onboarding-form/onboarding-form";
import { Button } from "@/components/ui/button/button";
import { Text } from "@/components/ui/text/text";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useRef: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/language-provider/language-provider", () => ({ useLang: () => ({ lang: "en" }) }));
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
const setStep = vi.fn();
function render(step: number, model: string, answers = {}, saving = false, error = "") {
  vi.mocked(useState).mockReturnValueOnce([step, setStep]).mockReturnValueOnce([model, vi.fn()])
    .mockReturnValueOnce([{ seasonsPerYear: "", hitReorder: "", replenishmentModel: "", leadTimeType: "", minMargin: "", currencyRisk: "", ...answers }, vi.fn()])
    .mockReturnValueOnce([saving, vi.fn()]).mockReturnValueOnce([error, vi.fn()]);
  return nodes(OnboardingForm({ existing: null }));
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(useRef).mockReturnValue({ current: false }); });
it.each([
  [1, "", {}, true],
  [1, "SEASONAL", {}, false],
  [2, "SEASONAL", { seasonsPerYear: "2" }, true],
  [2, "SEASONAL", { seasonsPerYear: "2", hitReorder: "no" }, false],
  [2, "CARRYOVER", { replenishmentModel: "rop" }, true],
  [2, "CARRYOVER", { replenishmentModel: "rop", leadTimeType: "local" }, false],
  [2, "HYBRID", {}, false],
  [3, "HYBRID", { minMargin: "40" }, true],
  [3, "HYBRID", { minMargin: "40", currencyRisk: "no" }, false],
] as const)("preserves navigation gating at step %s for %s with %j", (step, model, answers, disabled) => {
  const buttons = render(step, model, answers).filter(node => node.type === Button);
  expect(buttons).toHaveLength(step === 1 ? 1 : 2);
  expect(buttons.find(node => node.props.variant === "accent")!.props.disabled).toBe(disabled);
});
it.each([1, 2])("advances from step %s", step => {
  render(step, "HYBRID").find(node => node.type === Button && node.props.variant === "accent")!.props.onClick();
  expect(setStep).toHaveBeenCalledWith(step + 1);
});
it.each([2, 3])("returns from step %s", step => {
  render(step, "HYBRID").find(node => node.type === Button && node.props.variant === "report")!.props.onClick();
  expect(setStep).toHaveBeenCalledWith(step - 1);
});
it("blocks a pending save and exposes errors as alerts", () => {
  const tree = render(3, "HYBRID", { minMargin: "40", currencyRisk: "no" }, true, "Save failed");
  expect(tree.find(node => node.type === Button && node.props.variant === "accent")!.props.disabled).toBe(true);
  expect(tree.find(node => node.type === Text && node.props.role === "alert")!.props.children).toBe("Save failed");
});
