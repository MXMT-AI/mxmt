import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchCsvUploads, fetchCsvUpload, runCsvPacketAction } from "@/lib/client/csv-import-request";
const fetchMock = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockImplementation(async () => Response.json({ id: "packet", state: "ACTIVE" })); });
afterEach(() => vi.unstubAllGlobals());
const packet = { id: "packet", contentHash: "hash" };
it.each(["activate", "retry", "process", "cancel"] as const)("runs %s operations in order with the frozen hash", async action => {
  const result = await runCsvPacketAction(packet, action);
  const calls = fetchMock.mock.calls;
  const actions = calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(init.body));
  expect(actions).toEqual((action === "activate" || action === "retry" ? [action, "process"] : [action]).map(action => ({ action, hash: "hash" })));
  expect(calls.at(-1)![1].method).toBeUndefined();
  expect(calls.every(([path, init]) => path === "/api/connectors/csv/uploads/packet" && init.cache === "no-store")).toBe(true);
  expect(result.state).toBe("ACTIVE");
});
it.each([0, 1])("stops activation when request %s fails instead of reading a successful result", async index => {
  if (index === 1) fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
  fetchMock.mockResolvedValueOnce(Response.json({ code: "CSV_SETTINGS_CHANGED" }, { status: 409 }));
  await expect(runCsvPacketAction(packet, "activate")).rejects.toThrow("CSV_SETTINGS_CHANGED");
  expect(fetchMock).toHaveBeenCalledTimes(index + 1);
});
it("passes cancellation through and escapes packet IDs", async () => {
  const controller = new AbortController();
  await fetchCsvUpload("a/b", controller.signal);
  expect(fetchMock).toHaveBeenCalledWith("/api/connectors/csv/uploads/a%2Fb", { signal: controller.signal, cache: "no-store" });
});
it("reads sources, uploads and suppliers without using cached responses", async () => {
  const data = { source: null, uploads: [], suppliers: [] };
  fetchMock.mockResolvedValueOnce(Response.json(data));
  expect(await fetchCsvUploads()).toEqual(data);
  expect(fetchMock).toHaveBeenCalledWith("/api/connectors/csv/uploads", { cache: "no-store" });
});
it.each(["html", "null", "error-without-code"])("normalizes %s failure responses", async kind => {
  fetchMock.mockResolvedValueOnce(kind === "html" ? new Response("<html>error</html>", { status: 500 }) : Response.json(kind === "null" ? null : { error: "failed" }, { status: 500 }));
  await expect(fetchCsvUploads()).rejects.toThrow("CSV_OPERATION_FAILED");
});
it("propagates aborted requests to polling cleanup", async () => {
  fetchMock.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
  await expect(fetchCsvUpload("packet", new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" });
});
