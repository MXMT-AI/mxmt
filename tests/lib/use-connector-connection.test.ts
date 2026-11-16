import { useEffect, useRef, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { useConnectorConnection } from "@/components/settings/use-connector-connection";
import { salesDriveConnectionMessages } from "@/components/settings/sales-drive-connection-card/connection-messages";
import { keyCrmConnectionMessages } from "@/components/settings/key-crm-connection-card/connection-messages";

vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const initial = { configured: false, accountHost: null, hasReceiptsKey: false, hasYmlUrl: false, revision: null, lastCheck: null };
const connected = { ...initial, configured: true, accountHost: "demo", revision: 1 };
const setConnection = vi.fn(), setBusy = vi.fn(), setDirty = vi.fn(), setError = vi.fn(), setStatus = vi.fn();
const dispatchEvent = vi.fn();
function start(provider: "keycrm" | "horoshop" | "shopify" | "salesdrive" = "keycrm", lang: "uk" | "en" = "en") {
  vi.mocked(useState).mockReturnValueOnce([initial, setConnection]).mockReturnValueOnce([null, setBusy])
    .mockReturnValueOnce([true, setDirty]).mockReturnValueOnce(["", setError]).mockReturnValueOnce(["", setStatus]);
  return useConnectorConnection(provider, initial, lang, provider === "keycrm" ? keyCrmConnectionMessages[lang] : provider === "salesdrive" ? salesDriveConnectionMessages[lang] : undefined);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRef).mockImplementation(() => ({ current: null }));
  vi.stubGlobal("window", { dispatchEvent });
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify(connected)));
});
afterEach(() => vi.unstubAllGlobals());

it.each(["uk", "en"] as const)("saves KeyCRM through the shared contract with localized feedback in %s", async lang => {
  const body = { accountId: "demo", apiKey: "secret" };
  await expect(start("keycrm", lang).perform("save", body)).resolves.toEqual(connected);
  expect(apiFetch).toHaveBeenCalledWith("/api/connectors/keycrm", {
    method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  expect(setConnection).toHaveBeenCalledWith(connected);
  expect(setDirty).toHaveBeenCalledWith(false);
  expect(setStatus).toHaveBeenLastCalledWith(keyCrmConnectionMessages[lang].saved);
  expect(dispatchEvent.mock.lastCall![0].type).toBe("connector-connection-changed");
  expect(setBusy).toHaveBeenLastCalledWith(null);
});
it("checks KeyCRM without clearing unsaved changes", async () => {
  await start().perform("check");
  expect(apiFetch).toHaveBeenCalledWith("/api/connectors/keycrm", expect.objectContaining({ method: "POST" }));
  expect(setDirty).not.toHaveBeenCalled();
  expect(setStatus).toHaveBeenLastCalledWith(keyCrmConnectionMessages.en.checked);
});
it.each(["VALIDATION_ERROR", "CONNECTOR_CONFIG_CHANGED", "ACCESS_DENIED"])("preserves KeyCRM-specific %s feedback", async code => {
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ code }), { status: 400 }));
  await expect(start().perform("save")).resolves.toBeNull();
  expect(setError).toHaveBeenLastCalledWith(code === "VALIDATION_ERROR" ? keyCrmConnectionMessages.en.validationError
    : code === "CONNECTOR_CONFIG_CHANGED" ? keyCrmConnectionMessages.en.configChanged
    : keyCrmConnectionMessages.en.failurePrefix + code);
  expect(setConnection).not.toHaveBeenCalled();
  expect(dispatchEvent).not.toHaveBeenCalled();
  expect(setBusy).toHaveBeenLastCalledWith(null);
});
it("rejects invalid success payloads without overwriting the saved connection", async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response("{}"));
  await expect(start().perform("check")).resolves.toBeNull();
  expect(setError).toHaveBeenLastCalledWith(keyCrmConnectionMessages.en.invalidResponse);
  expect(setConnection).not.toHaveBeenCalled();
});
it("keeps network failures localized and releases busy state", async () => {
  vi.mocked(apiFetch).mockRejectedValue(new Error("offline"));
  await expect(start("keycrm", "uk").perform("save")).resolves.toBeNull();
  expect(setError).toHaveBeenLastCalledWith("Не вдалося підключитися. Повторіть спробу.");
  expect(setBusy).toHaveBeenLastCalledWith(null);
});
it.each(["horoshop", "shopify"] as const)("preserves default behavior for %s", async provider => {
  await start(provider).perform("save");
  expect(apiFetch).toHaveBeenCalledWith(`/api/connectors/${provider}`, expect.objectContaining({ method: "PUT" }));
  const name = provider === "horoshop" ? "Horoshop" : "Shopify";
  expect(setStatus).toHaveBeenLastCalledWith(`Saved. Check read scopes, then select ${name} as the reporting source.`);
});
it.each(["uk", "en"] as const)("preserves SalesDrive success and network messages in %s", async lang => {
  const state = start("salesdrive", lang);
  await state.perform("save", { accountHost: "demo.salesdrive.me", ordersApiKey: "secret" });
  expect(setStatus).toHaveBeenLastCalledWith(salesDriveConnectionMessages[lang].saved);
  expect(apiFetch).toHaveBeenCalledWith("/api/connectors/salesdrive", expect.objectContaining({ method: "PUT" }));
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline"));
  await state.perform("check");
  expect(setError).toHaveBeenLastCalledWith(salesDriveConnectionMessages[lang].networkError);
});
it.each([
  ["CONNECTOR_STORAGE_UNAVAILABLE", "storageUnavailable"],
  ["VALIDATION_ERROR", "validationError"],
  ["OTHER_ERROR", "failure"],
] as const)("keeps SalesDrive error %s and runs secret cleanup after failure", async (code, message) => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ code }), { status: 400 }));
  const cleanup = vi.fn();
  await start("salesdrive").perform("save", {}, cleanup);
  expect(setError).toHaveBeenLastCalledWith(salesDriveConnectionMessages.en[message]);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(setConnection).not.toHaveBeenCalled();
});
it("runs cleanup after successful save and blocks duplicate requests without premature cleanup", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const state = start("salesdrive"), cleanup = vi.fn();
  const pending = state.perform("save", {}, cleanup);
  await state.perform("save", {}, cleanup);
  expect(apiFetch).toHaveBeenCalledOnce();
  expect(setBusy).toHaveBeenLastCalledWith("save");
  expect(cleanup).not.toHaveBeenCalled();
  finish(new Response(JSON.stringify(connected)));
  await pending;
  expect(cleanup).toHaveBeenCalledOnce();
  expect(setBusy).toHaveBeenLastCalledWith(null);
  await state.perform("check");
  expect(setStatus).toHaveBeenLastCalledWith(salesDriveConnectionMessages.en.checked);
  expect(apiFetch).toHaveBeenCalledTimes(2);
});
