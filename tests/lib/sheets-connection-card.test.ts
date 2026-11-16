import { isValidElement, useRef, useState, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import SheetsConnectionCard from "@/components/settings/sheets-connection-card/sheets-connection-card";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh }) }));
const refresh = vi.fn(), setConnection = vi.fn(), setBusy = vi.fn(), setMessage = vi.fn();
const connection = { fileId: "demo", revision: 4, origin: "tenant" as const };
const url = "https://docs.google.com/spreadsheets/d/demo/edit";
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function start(initial: typeof connection | null = connection, canManage = true) {
  vi.mocked(useState).mockReturnValueOnce([initial, setConnection]).mockReturnValueOnce([url, vi.fn()])
    .mockReturnValueOnce([false, setBusy]).mockReturnValueOnce(["", setMessage]);
  const tree = nodes(SheetsConnectionCard({ initial, canManage, lang: "en" }));
  return () => tree.find(node => node.type === "form")!.props.onSubmit({ preventDefault: vi.fn() });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRef).mockImplementation(initial => ({ current: initial }));
  vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify({ connection })));
});
it.each([null, connection])("saves with the expected revision for %j", async initial => {
  await start(initial)();
  expect(apiFetch).toHaveBeenCalledWith("/api/settings/google-sheets", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, revision: initial?.revision ?? 0 }),
  });
  expect(setConnection).toHaveBeenCalledWith(connection);
  expect(refresh).toHaveBeenCalledOnce();
  expect(setMessage).toHaveBeenLastCalledWith("Spreadsheet connected. You can now import in Data & Reports.");
});
it.each([
  ["SHEETS_CONNECTION_CHANGED", "Connection changed. Reload this page."],
  ["VALIDATION_ERROR", "Could not save. Check the URL and administrator access."],
])("keeps the current connection after %s", async (code, message) => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ code }), { status: 409 }));
  await start()();
  expect(setMessage).toHaveBeenLastCalledWith(message);
  expect(setConnection).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  expect(setBusy).toHaveBeenLastCalledWith(false);
});
it("releases the lock after network failure so the user can retry", async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline"));
  const submit = start();
  await submit();
  expect(setMessage).toHaveBeenLastCalledWith("Network error. Please retry.");
  await submit();
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledOnce();
});
it("blocks a second submission before the busy state rerenders", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const submit = start();
  const pending = submit();
  await submit();
  expect(apiFetch).toHaveBeenCalledOnce();
  finish(new Response(JSON.stringify({ connection })));
  await pending;
  expect(refresh).toHaveBeenCalledOnce();
});
it("does not submit for a viewer", async () => {
  await start(connection, false)();
  expect(apiFetch).not.toHaveBeenCalled();
  expect(setBusy).not.toHaveBeenCalled();
});
