import { expect, it } from "vitest";
import { readApiJson } from "@/lib/api-response";
import { isPublicConnection } from "@/lib/connectors/public-connection";
it("keeps HTTP error status available for non-JSON or code-less errors and rejects malformed successful connection responses", async () => {
  const proxy = new Response("<html>Proxy failure</html>", { status: 502 });
  const error = await readApiJson(proxy);
  expect(error.error).toContain("HTTP 502");
  expect(error.code).toBeUndefined();
  expect(
    (await readApiJson(Response.json({ error: "failure" }, { status: 503 })))
      .code,
  ).toBeUndefined();
  for (const body of [
    null,
    [],
    {},
    "text",
    { configured: true },
    {
      configured: true,
      accountHost: "A",
      hasReceiptsKey: false,
      hasYmlUrl: false,
      revision: 1,
      lastCheck: {},
    },
    await readApiJson(new Response("<html>OK?</html>")),
  ])
    expect(isPublicConnection(body)).toBe(false);
  expect(
    isPublicConnection({
      configured: true,
      accountHost: "A",
      hasReceiptsKey: false,
      hasYmlUrl: false,
      revision: 1,
      lastCheck: null,
    }),
  ).toBe(true);
});

it("rejects malformed optional Shopify identity metadata before diagnostics can render it", () => {
  const initial = {
    configured: true,
    accountHost: "shop.myshopify.com",
    hasReceiptsKey: false,
    hasYmlUrl: false,
    revision: 1,
    lastCheck: {
      ok: true,
      checkedAt: "2026-10-27T16:00:00Z",
      checks: [],
      statuses: { entries: [], complete: true, reason: null },
      channels: { entries: [], complete: false, reason: "UNSUPPORTED" },
      metadata: {
        apiVersion: "2026-10",
        shopId: "gid://shopify/Shop/1",
        appId: "gid://shopify/App/1",
        timezone: "Europe/Kyiv",
        scopes: ["read_orders"],
      },
    },
  };
  expect(isPublicConnection(initial)).toBe(true);
  for (const metadata of [
    null,
    {},
    { ...initial.lastCheck.metadata, scopes: "read_orders" },
    { ...initial.lastCheck.metadata, scopes: [null] },
  ])
    expect(
      isPublicConnection({
        ...initial,
        lastCheck: { ...initial.lastCheck, metadata },
      }),
    ).toBe(false);
});
