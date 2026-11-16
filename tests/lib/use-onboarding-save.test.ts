import { useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { useOnboardingSave } from "@/components/settings/onboarding-form/use-onboarding-save";
import type { Answers } from "@/components/settings/onboarding-form/onboarding-types";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const setSaving = vi.fn(), setError = vi.fn(), onSaved = vi.fn();
const answers: Answers = {
  storeType: "mono", categories: ["clothes"], channels: ["website"], city: "kyiv",
  seasonsPerYear: "2", ssArrival: "", saleStart: "end-season", hitReorder: "no", batchesPerSeason: "",
  replenishmentModel: "", leadTimeType: "", eolRisk: "", minMargin: "40", currencyRisk: "no", logisticsRestrictions: "stable",
};
function start(enabled = true, model: "SEASONAL" | "" = "SEASONAL") {
  vi.mocked(useState).mockReturnValueOnce([false, setSaving]).mockReturnValueOnce(["", setError]);
  return useOnboardingSave({ model, answers, enabled, onSaved });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRef).mockReturnValue({ current: false });
  vi.mocked(apiFetch).mockImplementation(async () => new Response("{}"));
});
it("sends the unchanged brief and refreshes only after success", async () => {
  await start().save();
  expect(apiFetch).toHaveBeenCalledWith("/api/onboarding", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessModel: "SEASONAL", answers }),
  });
  expect(onSaved).toHaveBeenCalledOnce();
  expect(setSaving.mock.calls).toEqual([[true], [false]]);
  expect(setError).toHaveBeenCalledExactlyOnceWith("");
});
it("blocks duplicate submissions until the first request completes", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const state = start();
  const pending = state.save();
  await state.save();
  expect(apiFetch).toHaveBeenCalledOnce();
  expect(onSaved).not.toHaveBeenCalled();
  finish(new Response("{}"));
  await pending;
  expect(onSaved).toHaveBeenCalledOnce();
});
it.each([false, true])("reports server failure=%s without refreshing and allows retry", async serverFailure => {
  if (serverFailure) vi.mocked(apiFetch).mockResolvedValueOnce(new Response("Invalid brief", { status: 400 }));
  else vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Offline"));
  const state = start();
  await state.save();
  expect(setError).toHaveBeenLastCalledWith(serverFailure ? "Invalid brief" : "Offline");
  expect(onSaved).not.toHaveBeenCalled();
  expect(setSaving).toHaveBeenLastCalledWith(false);
  await state.save();
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(onSaved).toHaveBeenCalledOnce();
});
it.each([[false, "SEASONAL"], [true, ""]] as const)("prevents saving with enabled=%s and model=%s", async (enabled, model) => {
  await start(enabled, model).save();
  expect(apiFetch).not.toHaveBeenCalled();
  expect(setSaving).not.toHaveBeenCalled();
});
