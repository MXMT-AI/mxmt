import { useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { useSheetsMappingAction } from "@/components/settings/sheets-mapping-card/use-sheets-mapping-action";
import type { SheetsFieldMapping, SheetsMappingMetadata, SheetsMappingPreview } from "@/lib/sheets-mapping-contract";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const setBusy = vi.fn(), onPreview = vi.fn(), onApproved = vi.fn(), onError = vi.fn(), onMessage = vi.fn();
const meta = { revision: 4, input: { importRunId: "run" } } as SheetsMappingMetadata;
const draft = { policy: { currency: "UAH" } } as SheetsFieldMapping;
const preview = { configId: "config", previewHash: "hash", summary: { blockingErrors: [] } } as unknown as SheetsMappingPreview;
const previewInput = { kind: "preview" as const, sourceId: "sheet&demo", meta, draft };
const approveInput = { kind: "approve" as const, sourceId: "sheet&demo", preview, reference: "Approved evidence", confirmed: true };
function start(options: Partial<Parameters<typeof useSheetsMappingAction>[0]> = {}) {
  return useSheetsMappingAction({ lang: "en", canManage: true, loading: false, onPreview, onApproved, onError, onMessage, ...options });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useState).mockReturnValue([false, setBusy]);
  vi.mocked(useRef).mockImplementation(initial => ({ current: initial }));
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify(preview)));
});
it("previews with the exact import and mapping revision without approving", async () => {
  await start().action(previewInput);
  expect(apiFetch).toHaveBeenCalledWith("/api/connectors/sheets/mapping/sheet%26demo/preview", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: 4, importRunId: "run", mapping: draft }),
  });
  expect(onPreview).toHaveBeenCalledWith(preview);
  expect(onApproved).not.toHaveBeenCalled();
  expect(setBusy).toHaveBeenLastCalledWith(false);
});
it("approves only the preview hash and evidence reference", async () => {
  await start().action(approveInput);
  expect(apiFetch).toHaveBeenCalledWith("/api/connectors/sheets/mapping/sheet%26demo/approve", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ configId: "config", previewHash: "hash", reference: "Approved evidence" }),
  });
  expect(onApproved).toHaveBeenCalledOnce();
  expect(onPreview).not.toHaveBeenCalled();
  expect(onMessage).toHaveBeenLastCalledWith("Mapping approved. Source selection and shared-model import are separate actions.");
});
it.each([{ canManage: false }, { loading: true }])("blocks requests with %j", async options => {
  await start(options).action(previewInput);
  expect(apiFetch).not.toHaveBeenCalled();
});
it.each([{ sourceId: "" }, { meta: null }, { draft: null }])("blocks incomplete preview %j", async options => {
  await start().action({ ...previewInput, ...options });
  expect(apiFetch).not.toHaveBeenCalled();
});
it.each([
  { preview: null }, { confirmed: false }, { reference: "   " },
  { preview: { ...preview, summary: { ...preview.summary, blockingErrors: ["PRODUCT_ID_MISSING"] } } },
])("blocks invalid approval %j", async options => {
  await start().action({ ...approveInput, ...options });
  expect(apiFetch).not.toHaveBeenCalled();
  expect(onApproved).not.toHaveBeenCalled();
});
it("does not submit twice and releases its lock after failure", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const state = start();
  const pending = state.action(approveInput);
  await state.action(approveInput);
  expect(apiFetch).toHaveBeenCalledOnce();
  finish(new Response(JSON.stringify({ code: "SHEETS_MAPPING_PREVIEW_EXPIRED" }), { status: 409 }));
  await pending;
  expect(onError).toHaveBeenLastCalledWith("The preview expired. Preview the mapping again.");
  expect(onApproved).not.toHaveBeenCalled();
  expect(setBusy).toHaveBeenLastCalledWith(false);
  await state.action(approveInput);
  expect(onApproved).toHaveBeenCalledOnce();
});
it("keeps preview and approval callbacks untouched on network failure", async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Offline"));
  await start().action(previewInput);
  expect(onError).toHaveBeenLastCalledWith("Offline");
  expect(onPreview).not.toHaveBeenCalled();
  expect(onApproved).not.toHaveBeenCalled();
  expect(setBusy).toHaveBeenLastCalledWith(false);
});
