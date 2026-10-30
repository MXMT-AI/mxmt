import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const m = vi.hoisted(() => ({ connection: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/drive-connection", async original => ({ ...await original<typeof import("@/lib/drive-connection")>(), requireDriveConnection: m.connection }));
vi.mock("@/lib/server-fetch", () => ({ fetchWithTimeout: m.fetch }));
import { downloadConfiguredDriveWorkbook, syncFromDrive } from "@/lib/gdrive";
import { DriveConnectionError } from "@/lib/drive-connection";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", ""); vi.stubEnv("GOOGLE_DRIVE_FILE_ID", "global_workbook_12345"); });
afterEach(() => vi.unstubAllEnvs());
it("downloads only the resolved cabinet workbook for manual and scheduled callers", async () => {
  m.connection.mockImplementation(async (tenant: string) => ({ fileId: tenant === "demo" ? "demo_workbook_12345" : "zavod_workbook_12345" }));
  m.fetch.mockImplementation(async () => new Response("fixture".repeat(20)));
  expect((await downloadConfiguredDriveWorkbook("demo")).fileId).toBe("demo_workbook_12345");
  expect((await downloadConfiguredDriveWorkbook("zavod")).fileId).toBe("zavod_workbook_12345");
  expect(m.connection.mock.calls).toEqual([["demo"], ["zavod"]]);
  expect(m.fetch.mock.calls.map(c => c[0])).toEqual([
    "https://docs.google.com/spreadsheets/d/demo_workbook_12345/export?format=xlsx",
    "https://docs.google.com/spreadsheets/d/zavod_workbook_12345/export?format=xlsx",
  ]);
});
it("blocks both raw download and legacy synchronization without a tenant connection, before network access", async () => {
  m.connection.mockRejectedValue(new DriveConnectionError("SHEETS_CONNECTION_REQUIRED", 409));
  await expect(downloadConfiguredDriveWorkbook("demo")).rejects.toMatchObject({ code: "SHEETS_CONNECTION_REQUIRED" });
  await expect(syncFromDrive("demo")).rejects.toMatchObject({ code: "SHEETS_CONNECTION_REQUIRED" });
  expect(m.fetch).not.toHaveBeenCalled();
});
it.each([
  ["application/vnd.google-apps.spreadsheet", "/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "?alt=media"],
])("handles authenticated %s files without changing the bound file", async (mimeType, suffix) => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_KEY", Buffer.from(JSON.stringify({ client_email: "synthetic@example.test", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) })).toString("base64"));
  m.connection.mockResolvedValue({ fileId: "demo_workbook_12345" });
  m.fetch.mockResolvedValueOnce(Response.json({ access_token: "synthetic-token" }))
    .mockResolvedValueOnce(Response.json({ mimeType }))
    .mockResolvedValueOnce(new Response("fixture"));
  expect((await downloadConfiguredDriveWorkbook("demo")).buffer.toString()).toBe("fixture");
  expect(m.fetch.mock.calls[1][0]).toBe("https://www.googleapis.com/drive/v3/files/demo_workbook_12345?fields=mimeType");
  expect(m.fetch.mock.calls[2][0]).toBe(`https://www.googleapis.com/drive/v3/files/demo_workbook_12345${suffix}`);
});
