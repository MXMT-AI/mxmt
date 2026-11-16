import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsEditor } from "@/components/settings/settings-editor/settings-editor";
import { MerchandisingField } from "@/components/settings/merchandising-field/merchandising-field";
import { currentKyivMonth } from "@/components/settings/merchandising-settings-card/current-kyiv-month";
import { defaultClientSettings, type SettingsResource } from "@/lib/merchandising-settings";

afterEach(() => vi.useRealTimers());
it.each(["client", "brand", "sku", "supplier", "category"] as SettingsResource[])("preserves editable and read-only %s forms after extraction", resource => {
  const props = {
    resource, lang: "en" as const, canManage: true,
    item: { id: "demo", name: "Demo", revision: 2 },
    data: { client: { id: null, revision: 1, values: defaultClientSettings() }, items: [], pagination: { page: 1, totalRows: 0 }, brands: [], suppliers: [] },
    onDirty: vi.fn(), onSaved: vi.fn(),
  };
  const html = renderToStaticMarkup(createElement(SettingsEditor, props));
  expect(html).toContain("Save and apply");
  expect(html).toContain(resource === "client" ? 'name="profileMode"' : resource === "category" ? 'id="merch-seasonMonths"' : resource === "supplier" ? 'name="name"' : 'name="supplierId"');
  if (resource === "sku") {
    expect(html).toContain("Check saved SKU policy");
    expect(html).toContain('name="preview-revenue"');
  }
  const readonly = renderToStaticMarkup(createElement(SettingsEditor, { ...props, canManage: false }));
  expect(readonly).not.toContain("Save and apply");
  expect(readonly).not.toContain("Check on server");
  expect(readonly).toContain('disabled=""');
});

it("keeps the validation message linked to its labelled control", () => {
  const html = renderToStaticMarkup(createElement(MerchandisingField, {
    name: "moq", label: "MOQ", error: "Enter a positive number",
    children: createElement("input", { id: "merch-moq", "aria-describedby": "merch-error-moq", "aria-invalid": true }),
  }));
  expect(html).toMatch(/<label[^>]*>MOQ<input[^>]*id="merch-moq"/);
  expect(html).toContain('aria-describedby="merch-error-moq"');
  expect(html).toContain('id="merch-error-moq"');
  expect(html).toContain("Enter a positive number");
});

it.each([
  ["2026-01-31T22:30:00Z", "2026-02"],
  ["2026-06-30T21:30:00Z", "2026-07"],
])("uses the Kyiv month at the UTC boundary %s", (now, month) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  expect(currentKyivMonth()).toBe(month);
});
