import { useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useQualityMutation } from "@/components/settings/data-quality-card/use-quality-mutation";
import { saveDataQuality } from "@/lib/client/data-quality-request";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock("@/lib/client/data-quality-request", () => ({ saveDataQuality: vi.fn() }));
const setBusy = vi.fn(), reload = vi.fn(), onAliasSaved = vi.fn(), onError = vi.fn(), onMessage = vi.fn();
const change = { action: "alias" as const, alias: "Demo", brandId: "brand" };
function start(options = {}) { return useQualityMutation({ lang: "en", canManage: true, loading: false, reload, onAliasSaved, onError, onMessage, ...options }); }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(useState).mockReturnValue([false, setBusy]); vi.mocked(useRef).mockReturnValue({ current: false }); vi.mocked(saveDataQuality).mockResolvedValue(); reload.mockResolvedValue(undefined); });
it("clears the alias form only after saving and then refreshes diagnostics", async () => {
  await start().save(change);
  expect(saveDataQuality).toHaveBeenCalledWith(change);
  expect(onAliasSaved).toHaveBeenCalledOnce();
  expect(reload).toHaveBeenCalledOnce();
  expect(onMessage).toHaveBeenLastCalledWith("Alias saved. Refresh the catalog to apply it to products.");
  expect(setBusy).toHaveBeenLastCalledWith(false);
});
it("does not clear alias drafts after a product-kind update", async () => {
  await start().save({ action: "productKind", skuId: "p", productKind: "SERVICE" });
  expect(onAliasSaved).not.toHaveBeenCalled();
  expect(onMessage).toHaveBeenLastCalledWith("Product type saved.");
});
it("blocks duplicate saves until the original request and reload finish", async () => {
  let finish!: () => void;
  reload.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  const state = start(), pending = state.save(change);
  await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  await state.save(change);
  expect(saveDataQuality).toHaveBeenCalledOnce();
  finish();
  await pending;
  await state.save(change);
  expect(saveDataQuality).toHaveBeenCalledTimes(2);
});
it.each([{ canManage: false }, { loading: true }])("blocks mutation when %j", async options => {
  await start(options).save(change);
  expect(saveDataQuality).not.toHaveBeenCalled();
  expect(setBusy).not.toHaveBeenCalled();
});
it.each([false, true])("distinguishes failure after saved=%s and preserves retry", async saved => {
  if (saved) reload.mockRejectedValueOnce(new Error("refresh"));
  else vi.mocked(saveDataQuality).mockRejectedValueOnce(new Error("save"));
  const state = start();
  await state.save(change);
  expect(onAliasSaved).toHaveBeenCalledTimes(saved ? 1 : 0);
  expect(onError).toHaveBeenLastCalledWith(saved ? "Changes saved, but diagnostics could not refresh. Select Refresh diagnostics." : "Could not save changes. Check the selection and try again.");
  expect(setBusy).toHaveBeenLastCalledWith(false);
  await state.save(change);
  expect(saveDataQuality).toHaveBeenCalledTimes(2);
});
