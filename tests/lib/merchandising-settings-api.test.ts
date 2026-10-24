import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  list: vi.fn(),
  effective: vi.fn(),
  save: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) => ({ value: m.cookies.get(key) }),
  }),
}));
vi.mock("@/lib/merchandising-settings-store", () => ({
  listMerchandisingSettings: m.list,
  getEffectiveSkuSettings: m.effective,
  saveMerchandisingSettings: m.save,
}));
import { GET, POST } from "@/app/api/settings/merchandising/route";
import { signAccessToken } from "@/lib/auth";
import {
  defaultClientSettings,
  SettingsValidationError,
} from "@/lib/merchandising-settings";
import { resolveMerchandisingPolicy } from "@/lib/merchandising-policy";
function req(body?: unknown, query = "") {
  return new NextRequest(
    "https://app.example/api/settings/merchandising" + query,
    {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": "b",
        "x-user-role": "ADMIN",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
}
async function login(role: string) {
  m.cookies.set(
    "access_token",
    await signAccessToken({ sub: "owner-a", tenantId: "a", role }),
  );
}
beforeEach(() => {
  vi.stubEnv("JWT_ACCESS_SECRET", "settings-test-secret");
  vi.resetAllMocks();
  m.cookies.clear();
  m.list.mockResolvedValue({
    client: { revision: 0, values: defaultClientSettings() },
    items: [],
  });
  m.save.mockResolvedValue({ revision: 1 });
  m.effective.mockResolvedValue({
    client: { values: defaultClientSettings() },
    policy: resolveMerchandisingPolicy({ brandOwnership: "OWN" }),
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("tenant settings boundary", () => {
  it("rejects forged identity headers without a signed session", async () => {
    expect((await GET(req())).status).toBe(401);
    expect(m.list).not.toHaveBeenCalled();
  });
  it.each(["VIEWER", "ANALYST"])(
    "allows %s to read but not publish settings",
    async (role) => {
      await login(role);
      expect((await GET(req())).status).toBe(200);
      expect(
        (
          await POST(
            req({
              action: "save",
              resource: "client",
              id: null,
              expectedRevision: 0,
              values: defaultClientSettings(),
            }),
          )
        ).status,
      ).toBe(403);
      expect(m.save).not.toHaveBeenCalled();
    },
  );
  it("uses signed tenant/actor identity and bounded entity queries", async () => {
    await login("ADMIN");
    expect(
      (
        await POST(
          req({
            action: "save",
            resource: "client",
            id: null,
            expectedRevision: 0,
            values: defaultClientSettings(),
            tenantId: "b",
            actorId: "other",
          }),
        )
      ).status,
    ).toBe(200);
    expect(m.save).toHaveBeenCalledWith(
      "a",
      "owner-a",
      "client",
      null,
      0,
      defaultClientSettings(),
      undefined,
      { creationKey: undefined },
    );
    const response = await GET(req(undefined, "?resource=sku&page=2&q=SKU"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(m.list).toHaveBeenCalledWith("a", "sku", 2, "SKU");
    expect((await GET(req(undefined, "?resource=User"))).status).toBe(400);
    expect((await GET(req(undefined, "?page=0"))).status).toBe(400);
  });
  it("reports validation and stale revision errors without private database text", async () => {
    await login("ADMIN");
    const body = {
      action: "save",
      resource: "client",
      id: null,
      expectedRevision: 0,
      values: {},
    };
    m.save.mockRejectedValueOnce(
      new SettingsValidationError({ riskWohWeeks: "above_healthy" }),
    );
    const validation = await POST(req(body));
    expect(validation.status).toBe(400);
    expect(await validation.json()).toMatchObject({
      fields: { riskWohWeeks: "above_healthy" },
    });
    m.save.mockRejectedValueOnce(new Error("SETTINGS_CONFLICT"));
    expect((await POST(req(body))).status).toBe(409);
    m.save.mockRejectedValueOnce(new Error("secret-and-customer-payload"));
    const response = await POST(req(body));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-and");
  });
  it("previews persisted policy rather than trusting caller-supplied ownership or settings", async () => {
    await login("ADMIN");
    const response = await POST(
      req({
        action: "preview",
        skuId: "sku-a",
        ownership: "CONSIGNMENT",
        settings: { commissionPct: 100 },
        inputs: {
          revenue: "100",
          cost: "40",
          weeklyVelocity: "7",
          stock: "10",
          inTransit: null,
          month: 1,
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(m.effective).toHaveBeenCalledWith("a", "sku-a");
    expect(await response.json()).toMatchObject({
      preview: {
        grossProfit: "60",
        orderQuantity: null,
        reorderBlocked: "IN_TRANSIT_UNKNOWN",
      },
    });
  });
  it("requires supplier creation idempotency and rejects malformed preview numbers", async () => {
    await login("ADMIN");
    expect(
      (
        await POST(
          req({
            action: "save",
            resource: "supplier",
            id: null,
            expectedRevision: 0,
            values: {},
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          req({
            action: "preview",
            skuId: "sku-a",
            inputs: { revenue: "NaN" },
          }),
        )
      ).status,
    ).toBe(400);
    expect((await POST(req({ action: "toString" }))).status).toBe(400);
  });
  it("bounds request bodies before applying any setting", async () => {
    await login("ADMIN");
    expect(
      (
        await POST(
          req({
            action: "save",
            resource: "client",
            payload: "x".repeat(66000),
          }),
        )
      ).status,
    ).toBe(413);
    expect(m.save).not.toHaveBeenCalled();
  });
});
