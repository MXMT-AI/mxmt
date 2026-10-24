import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ cookies: new Map<string, string>(), enqueue: vi.fn(), progress: vi.fn(), step: vi.fn(), resume: vi.fn(), connection: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => ({ value: m.cookies.get(key) }) }) }));
vi.mock("@/lib/connectors/order-jobs", () => ({ enqueueOrderImport: m.enqueue, getOrderImportProgress: m.progress, processOrderJob: m.step, resumeOrderImport: m.resume }));
vi.mock("@/lib/prisma", () => ({ prisma: { connectorConnection: { findUnique: m.connection } } }));
import { GET, POST } from "@/app/api/connectors/salesdrive/import/route";
import { GET as CRON } from "@/app/api/cron/salesdrive-orders/route";
import { POST as WEBHOOK } from "@/app/api/webhooks/salesdrive/[sourceId]/route";
import { salesDriveWebhookToken, parseOrderWebhook } from "@/lib/connectors/order-webhook";
import { middleware } from "@/middleware";
import { signAccessToken } from "@/lib/auth";
function req(method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://app.example/api/connectors/salesdrive/import?tenantId=b", { method, headers: { "Content-Type": "application/json", "x-tenant-id": "b", "x-user-role": "ADMIN", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function login(role = "ADMIN") { m.cookies.set("access_token", await signAccessToken({ sub: "user-a", tenantId: "a", role })); }
beforeEach(() => { vi.stubEnv("JWT_ACCESS_SECRET", "synthetic-jwt-secret"); vi.stubEnv("CRON_SECRET", "synthetic-cron-secret"); vi.stubEnv("SALESDRIVE_WEBHOOK_SECRET", "a".repeat(32)); vi.clearAllMocks(); m.cookies.clear(); m.progress.mockResolvedValue(null); m.step.mockResolvedValue({ processed: false }); m.connection.mockResolvedValue({ tenantId: "a", accountHost: "demo.salesdrive.me" }); });
afterEach(() => vi.unstubAllEnvs());
describe("order import authorization and safe errors", () => {
  it("rejects forged identity headers", async () => { expect((await GET(req())).status).toBe(401); expect(m.progress).not.toHaveBeenCalled(); });
  it.each(["VIEWER", "ANALYST"])("allows %s progress but prevents writes", async (role) => {
    await login(role); expect((await GET(req())).status).toBe(200); expect(m.progress).toHaveBeenCalledWith("a");
    expect((await POST(req("POST", { action: "backfill" }))).status).toBe(403); expect(m.enqueue).not.toHaveBeenCalled();
  });
  it("ignores caller tenant/source IDs", async () => {
    await login(); expect((await POST(req("POST", { action: "backfill", tenantId: "b", sourceId: "other" }))).status).toBe(200);
    expect(m.enqueue).toHaveBeenCalledWith("a", "BACKFILL");
  });
  it("bounds action bodies and does not expose database errors", async () => {
    await login(); expect((await POST(req("POST", { action: "x", payload: "x".repeat(3000) }))).status).toBe(413);
    m.enqueue.mockRejectedValueOnce(new Error("private-key-and-PII"));
    const response = await POST(req("POST", { action: "backfill" })); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private-key");
  });
  it("requires the configured cron bearer token", async () => {
    expect((await CRON(req())).status).toBe(401); expect(m.step).not.toHaveBeenCalled();
    expect((await CRON(req("GET", undefined, { authorization: "Bearer synthetic-cron-secret" }))).status).toBe(200);
    expect(m.step).toHaveBeenCalledWith();
  });
});
describe("authenticated webhook relay", () => {
  const context = { params: Promise.resolve({ sourceId: "source-a" }) };
  const event = { info: { webhookType: "order", webhookEvent: "status_change", account: "demo" }, data: { id: 123, version: 4 } };
  it("exempts only the authenticated receiver from cookie middleware", async () => {
    const allowed = await middleware(new NextRequest("https://app.example/api/webhooks/salesdrive/source-a"));
    expect(allowed.headers.get("x-middleware-next")).toBe("1");
    const blocked = await middleware(new NextRequest("https://app.example/api/webhooks/salesdrive/source-a/admin"));
    expect(blocked.status).toBe(401);
    expect((await middleware(new NextRequest("https://app.example/api/webhooks/other"))).status).toBe(401);
  });
  it("rejects anonymous, cross-source tokens and mismatched accounts", async () => {
    expect((await WEBHOOK(req("POST", event), context)).status).toBe(401);
    expect((await WEBHOOK(req("POST", event, { authorization: `Bearer ${salesDriveWebhookToken("source-b")}` }), context)).status).toBe(401);
    expect(parseOrderWebhook({ ...event, info: { ...event.info, account: "other" } }, "demo.salesdrive.me")).toBeNull();
  });
  it.each(["9007199254740993", "9223372036854775807"])("preserves raw numeric order ID %s before enqueue", async (id) => {
    const request = new NextRequest("https://app.example/api/webhooks/salesdrive/source-a", { method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${salesDriveWebhookToken("source-a")}` },
      body: `{"info":{"webhookType":"order","webhookEvent":"status_change","account":"demo"},"data":{"id":${id},"version":4}}` });
    expect((await WEBHOOK(request, context)).status).toBe(202);
    expect(m.enqueue).toHaveBeenCalledWith("a", "WEBHOOK", expect.objectContaining({ orderId: id, payload: expect.objectContaining({ data: { id, version: 4 } }) }));
  });
  it.each(["9007199254740991.1", "[123]", "true", "null"])("rejects invalid raw order ID %s without acknowledging it", async (id) => {
    const request = new NextRequest("https://app.example/api/webhooks/salesdrive/source-a", { method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${salesDriveWebhookToken("source-a")}` },
      body: `{"info":{"webhookType":"order","webhookEvent":"status_change","account":"demo"},"data":{"id":${id}}}` });
    expect((await WEBHOOK(request, context)).status).toBe(400);
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it("retains webhook body limits and malformed JSON errors with the lossless parser", async () => {
    const headers = { "Content-Type": "application/json", authorization: `Bearer ${salesDriveWebhookToken("source-a")}` };
    expect((await WEBHOOK(new NextRequest("https://app.example/api/webhooks/salesdrive/source-a", { method: "POST", headers, body: "{" }), context)).status).toBe(400);
    expect((await WEBHOOK(new NextRequest("https://app.example/api/webhooks/salesdrive/source-a", { method: "POST", headers, body: "x".repeat(262_145) }), context)).status).toBe(413);
    expect(m.enqueue).not.toHaveBeenCalled();
    expect(parseOrderWebhook({ ...event, data: { id: Number("9007199254740993") } }, "demo.salesdrive.me")).toBeNull();
  });
  it("accepts a verified event for refetch; returns retryable 503 when busy", async () => {
    const headers = { authorization: `Bearer ${salesDriveWebhookToken("source-a")}` };
    expect((await WEBHOOK(req("POST", event, headers), context)).status).toBe(202);
    expect(m.enqueue).toHaveBeenCalledWith("a", "WEBHOOK", expect.objectContaining({ orderId: "123", eventKey: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    m.enqueue.mockRejectedValueOnce(new Error("IMPORT_BUSY"));
    const response = await WEBHOOK(req("POST", event, headers), context);
    expect(response.status).toBe(503); expect(response.headers.get("Retry-After")).toBe("60");
  });
});
