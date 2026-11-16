import { useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { useDriveSync } from "@/components/settings/drive-sync-card/use-drive-sync";

vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const setState = vi.fn();
const response = (data: object, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useState).mockReturnValue([{}, setState]);
  vi.mocked(useRef).mockReturnValue({ current: false });
  vi.mocked(apiFetch).mockResolvedValue(response({}));
});

it("preserves import totals and sheet details after successful sync", async () => {
  const imported = { skus: 2, inventory: 3, sales: 4, sheets: [{ name: "Sales", imported: "4", skipped: "" }] };
  vi.mocked(apiFetch).mockResolvedValue(response(imported));
  await useDriveSync("en", true).triggerSync();
  expect(apiFetch).toHaveBeenCalledWith("/api/sync/drive", { method: "POST" });
  expect(setState).toHaveBeenLastCalledWith({ syncing: false, result: "ok", errMsg: "", importResult: imported });
});

it("keeps warning distinct from success and supplies missing totals", async () => {
  vi.mocked(apiFetch).mockResolvedValue(response({ warning: "No matching sheets" }));
  await useDriveSync("en", true).triggerSync();
  expect(setState).toHaveBeenLastCalledWith({ syncing: false, result: "warn", errMsg: "No matching sheets", importResult: { skus: 0, inventory: 0, sales: 0, sheets: [] } });
});

it("preserves server error messages and permits retry", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(response({ error: "ACCESS_DENIED" }, 403));
  const sync = useDriveSync("en", true);
  await sync.triggerSync();
  expect(setState).toHaveBeenLastCalledWith({ syncing: false, result: "error", errMsg: "ACCESS_DENIED", importResult: null });
  await sync.triggerSync();
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(setState.mock.lastCall![0].result).toBe("ok");
});

it.each(["uk", "en"] as const)("localizes network failure and releases the lock in %s", async lang => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline"));
  const sync = useDriveSync(lang, true);
  await sync.triggerSync();
  expect(setState).toHaveBeenLastCalledWith({ syncing: false, result: "error", errMsg: lang === "uk" ? "Помилка мережі" : "Network error", importResult: null });
  await sync.triggerSync();
  expect(apiFetch).toHaveBeenCalledTimes(2);
});

it("blocks duplicate requests while sync is pending", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const sync = useDriveSync("en", true);
  const pending = sync.triggerSync();
  await sync.triggerSync();
  expect(apiFetch).toHaveBeenCalledOnce();
  expect(setState).toHaveBeenCalledOnce();
  expect(setState.mock.lastCall![0]).toEqual({ syncing: true, result: null, errMsg: "", importResult: null });
  finish(response({}));
  await pending;
  await sync.triggerSync();
  expect(apiFetch).toHaveBeenCalledTimes(2);
});

it("does not send a request when Drive is not configured", async () => {
  await useDriveSync("en", false).triggerSync();
  expect(apiFetch).not.toHaveBeenCalled();
  expect(setState).not.toHaveBeenCalled();
});
