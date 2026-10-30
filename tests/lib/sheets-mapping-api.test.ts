import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const state = vi.hoisted(() => ({
  cookie: "",
  metadata: vi.fn(),
  preview: vi.fn(),
  approve: vi.fn(),
  project: vi.fn(),
  intent: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: state.cookie }) }),
}));
vi.mock("@/lib/connectors/sheets-mapping-store", () => ({
  readSheetsMappingMetadata: state.metadata,
  previewSheetsMapping: state.preview,
  approveSheetsMapping: state.approve,
}));
vi.mock("@/lib/connectors/sheets-projection-store", () => ({
  projectSheetsImport: state.project,
  readSheetsProjectionIntent: state.intent,
}));
import {
  POST as project,
  GET as intent,
} from "@/app/api/connectors/sheets/projection/[sourceId]/route";
import { signAccessToken } from "@/lib/auth";
import { SheetsMappingError } from "@/lib/connectors/sheets-mapping-validation";
import { GET } from "@/app/api/connectors/sheets/mapping/[sourceId]/route";
import { POST as preview } from "@/app/api/connectors/sheets/mapping/[sourceId]/preview/route";
import { POST as approve } from "@/app/api/connectors/sheets/mapping/[sourceId]/approve/route";
const context = { params: Promise.resolve({ sourceId: "sheet" }) };
const req = (body?: string, query = "") =>
  new NextRequest(
    `https://app.test/api/connectors/sheets/mapping/sheet${query}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": "foreign",
        "x-user-role": "SUPER_ADMIN",
      },
      ...(body === undefined ? {} : { body }),
    },
  );
const login = async (role = "ADMIN") => {
  state.cookie = await signAccessToken({ sub: "owner", tenantId: "a", role });
};
beforeEach(() => {
  vi.stubEnv("JWT_ACCESS_SECRET", "mapping-api-fixture-key");
  state.cookie = "";
  vi.clearAllMocks();
  state.metadata.mockResolvedValue({ revision: 0 });
  state.preview.mockResolvedValue({ revision: 1 });
  state.approve.mockResolvedValue({ state: "APPROVED" });
  state.project.mockResolvedValue({ outcome: "projected" });
  state.intent.mockResolvedValue({
    sourceId: "sheet",
    importRunId: "run",
    mappingId: "mapping",
    selectionRevision: 1,
  });
});
afterAll(() => vi.unstubAllEnvs());
it.each(["CATALOG_IDENTITY_CONFLICT", "DUPLICATE_CATALOG_SKU"])("returns an actionable validation error for %s", async code => {
  await login();
  state.project.mockRejectedValue(new Error(code));
  const response = await project(req("{}"), context);
  expect(response.status).toBe(422);
  const body = await response.json();
  expect(body.code).toBe("SHEETS_CATALOG_IDENTITY_CONFLICT");
  expect(body.requestId).toMatch(/^[a-zA-Z0-9_-]{1,80}$/);
  expect(body.error).toContain("product identities");
});
it("requires a signed admin session for metadata, preview and approval, ignoring identity headers", async () => {
  for (const handler of [GET, preview, approve, project, intent])
    expect((await handler(req("{}"), context)).status).toBe(401);
  await login("ANALYST");
  for (const handler of [GET, preview, approve, project, intent])
    expect((await handler(req("{}"), context)).status).toBe(403);
  expect(state.metadata).not.toHaveBeenCalled();
  expect(state.preview).not.toHaveBeenCalled();
  expect(state.approve).not.toHaveBeenCalled();
  expect(state.project).not.toHaveBeenCalled();
  await login();
  const response = await GET(req(), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(state.metadata).toHaveBeenCalledWith(
    { tenantId: "a", userId: "owner" },
    "sheet",
  );
});
it("rejects query overrides, oversized bodies and malformed JSON before reaching the store", async () => {
  await login();
  expect((await GET(req(undefined, "?tenantId=foreign"), context)).status).toBe(
    400,
  );
  for (const handler of [preview, approve, project]) {
    expect(
      (await handler(req("{}", "?sourceId=foreign"), context)).status,
    ).toBe(400);
    expect((await handler(req("{"), context)).status).toBe(400);
    expect(
      (
        await handler(
          req(JSON.stringify({ value: "x".repeat(65536) })),
          context,
        )
      ).status,
    ).toBe(413);
  }
  expect(state.metadata).not.toHaveBeenCalled();
  expect(state.preview).not.toHaveBeenCalled();
  expect(state.approve).not.toHaveBeenCalled();
  expect(state.project).not.toHaveBeenCalled();
});
it("keeps preview and approval separate and sanitizes unexpected infrastructure errors", async () => {
  await login();
  await preview(req('{"expectedRevision":0}'), context);
  expect(state.preview).toHaveBeenCalledWith(
    { tenantId: "a", userId: "owner" },
    "sheet",
    { expectedRevision: 0 },
  );
  expect(state.approve).not.toHaveBeenCalled();
  expect(state.project).not.toHaveBeenCalled();
  state.approve.mockRejectedValueOnce(
    new SheetsMappingError("SHEETS_MAPPING_PREVIEW_EXPIRED", 409),
  );
  const expired = await approve(req("{}"), context);
  expect(expired.status).toBe(409);
  expect((await expired.json()).code).toBe("SHEETS_MAPPING_PREVIEW_EXPIRED");
  state.metadata.mockRejectedValueOnce(
    new Error("postgres://private-password@internal-host/source-row"),
  );
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const failed = await GET(req(), context);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toMatch(
      /private-password|internal-host|source-row/,
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-password");
  } finally {
    log.mockRestore();
  }
});

it("keeps projection intent scoped to the signed tenant and returns no source rows", async () => {
  await login();
  const intent = {
    importRunId: "run",
    mappingId: "mapping",
    selectionRevision: 1,
  };
  const result = await project(req(JSON.stringify(intent)), context);
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(state.project).toHaveBeenCalledWith(
    { tenantId: "a", userId: "owner" },
    "sheet",
    intent,
  );
  expect(await result.json()).toEqual({ outcome: "projected" });
});

it.each([
  { code: "57014" },
  { code: "P2010", meta: { code: "57014", message: "private source row" } },
  { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "57014", originalMessage: "private source row" } } } },
])("correlates projection failures without exposing database messages or source data (%j)", async details => {
  await login();
  state.project.mockRejectedValueOnce(Object.assign(new Error("private source row and database password"), details));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const failed = await project(req("{}"), context);
    const body = await failed.json();
    expect(failed.status).toBe(503);
    expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(log.mock.calls)).toContain(body.requestId);
    expect(JSON.stringify(log.mock.calls)).toContain("57014");
    if (details.code === "P2010") expect(log.mock.calls[0][1]).toMatchObject({ code: "P2010", databaseCode: "57014" });
    expect(JSON.stringify([body, log.mock.calls])).not.toMatch(/private source|database password/);
  } finally { log.mockRestore(); }
});

it.each(["private database password", 57014, { code: "57014" }, null])("does not log malformed nested database codes (%j)", async databaseCode => {
  await login();
  state.project.mockRejectedValueOnce(Object.assign(new Error("private database password"), {
    code: "P2010", meta: { code: databaseCode, driverAdapterError: { cause: { originalCode: databaseCode, originalMessage: "private database password" } } },
  }));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await project(req("{}"), context);
    expect(log.mock.calls[0][1]).not.toHaveProperty("databaseCode");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private database password");
  } finally { log.mockRestore(); }
});

it("returns a private projection intent to the signed admin without changing approval or source", async () => {
  await login();
  const result = await intent(req(), context);
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(state.intent).toHaveBeenCalledWith(
    { tenantId: "a", userId: "owner" },
    "sheet",
  );
  expect(await result.json()).toEqual({
    sourceId: "sheet",
    importRunId: "run",
    mappingId: "mapping",
    selectionRevision: 1,
  });
  expect(state.project).not.toHaveBeenCalled();
  expect(
    (await intent(req(undefined, "?tenantId=foreign"), context)).status,
  ).toBe(400);
});
