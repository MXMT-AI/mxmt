import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import KeyCrmConnectionCard from "@/components/settings/KeyCrmConnectionCard";
const initial = {
  configured: false,
  accountHost: null,
  hasReceiptsKey: false,
  hasYmlUrl: false,
  revision: null,
  lastCheck: null,
};
it("keeps KeyCRM credentials write-only, requires explicit mapping evidence and provides independent read diagnostics", () => {
  const admin = renderToStaticMarkup(
    React.createElement(KeyCrmConnectionCard, {
      initial,
      lang: "en",
      canManage: true,
    }),
  );
  expect(admin).toContain('type="password"');
  expect(admin).toContain('name="apiKey"');
  expect(admin).toContain("Check read scopes");
  expect(admin).toContain('name="mappingApproved"');
  expect(admin).toContain(
    "Successful reads do not prove the key has no write permissions",
  );
  expect(admin).toContain("Partial payment does not establish a sale");
  const viewer = renderToStaticMarkup(
    React.createElement(KeyCrmConnectionCard, {
      initial,
      lang: "uk",
      canManage: false,
    }),
  );
  expect(viewer).not.toContain("<form");
  expect(viewer).not.toContain('name="apiKey"');
});
