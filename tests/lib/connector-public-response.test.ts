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
