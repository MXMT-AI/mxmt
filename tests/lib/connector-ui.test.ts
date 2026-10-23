import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SalesDriveConnectionCard from "@/components/settings/SalesDriveConnectionCard";
import type { PublicConnection } from "@/lib/connectors/contract";

const empty: PublicConnection = { configured: false, accountHost: null, hasReceiptsKey: false, hasYmlUrl: false, revision: null, lastCheck: null };
describe("connection settings rendering", () => {
  it("provides labeled write-only controls and an accessible status for an administrator", () => {
    const html = renderToStaticMarkup(React.createElement(SalesDriveConnectionCard, { initial: empty, lang: "en", canManage: true }));
    expect(html).toContain('htmlFor="salesdrive-host"'.replace("htmlFor", "for"));
    expect(html.match(/type="password"/g)).toHaveLength(3);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Save connection");
    expect(html).toContain("Orders read key");
  });
  it("shows read-only status without credential controls to a viewer", () => {
    const html = renderToStaticMarkup(React.createElement(SalesDriveConnectionCard, { initial: { ...empty, configured: true, accountHost: "demo.salesdrive.me" }, lang: "uk", canManage: false }));
    expect(html).toContain("demo.salesdrive.me");
    expect(html).not.toContain("<form");
    expect(html).not.toContain('name="ordersApiKey"');
  });
});
