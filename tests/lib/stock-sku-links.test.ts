import { expect, it } from "vitest";
import { stockSkuLinks } from "@/components/stock/stock-sku-table/stock-sku-links";
const params = new URLSearchParams("snapshotId=frozen&channelId=2&period=custom&dateFrom=2026-09-01&dateTo=2026-09-30&brandId=old&skuId=old&currency=USD&classification=HEALTHY");
const row = { id: "sku&new", currency: "UAH", classification: "RISK", details: { brandId: "brand&new" } };
const query = (href: string) => new URL(href, "https://mxmt.test").searchParams;
it("pins both actions to the report context and the selected SKU without mutating input filters", () => {
  const before = params.toString(), links = stockSkuLinks(row, params, false);
  for (const href of Object.values(links)) {
    const target = query(href);
    expect(target.get("snapshotId")).toBe("frozen");
    expect(target.get("channelId")).toBe("2");
    expect(target.get("dateFrom")).toBe("2026-09-01");
    expect(target.get("dateTo")).toBe("2026-09-30");
    expect(target.get("skuId")).toBe("sku&new");
    expect(target.get("brandId")).toBe("brand&new");
    expect(target.get("currency")).toBe("UAH");
  }
  expect(query(links.repricing).has("mode")).toBe(false);
  expect(query(links.reordering).get("mode")).toBe("brand");
  expect(query(links.reordering).has("classification")).toBe(false);
  expect(params.toString()).toBe(before);
});
it("clears the brand and uses all-brand reordering for a monobrand report", () => {
  const links = stockSkuLinks(row, params, true);
  expect(query(links.reordering).get("mode")).toBe("all");
  expect(query(links.reordering).has("brandId")).toBe(false);
  expect(query(links.repricing).has("brandId")).toBe(false);
});
it("retains explicit unassigned values for unknown currency and brand", () => {
  const links = stockSkuLinks({ ...row, currency: null, details: null }, params, false);
  for (const href of Object.values(links)) {
    expect(query(href).get("currency")).toBe("__unassigned__");
    expect(query(href).get("brandId")).toBe("__unassigned__");
  }
});
it.each(["DEAD", "RISK", "HEALTHY", "DATA_ERROR"])("preserves only supported repricing classification %s", classification => {
  const links = stockSkuLinks({ ...row, classification }, params, false);
  expect(query(links.repricing).get("classification")).toBe(["DEAD", "RISK"].includes(classification) ? classification : null);
});
