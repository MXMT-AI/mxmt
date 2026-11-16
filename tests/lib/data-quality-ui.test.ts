import { createElement } from "react";
import { renderToStaticMarkup } from "../helpers/render-localized";
import { it, expect } from "vitest";
import Summary from "@/components/settings/data-quality-summary/data-quality-summary";
import { DataQualityStockFigures } from "@/components/settings/data-quality-stock-figures/data-quality-stock-figures";
import {
  readQualitySelection,
  writeQualitySelection,
} from "@/lib/data-quality-navigation";
import {
  qualityLabel,
  qualityGuidance,
  qualityFixHref,
} from "@/lib/data-quality-copy";
it.each(["uk", "en"] as const)("distinguishes zero stock from unknown stock in %s", lang => {
  const stock = {
    currency: null, skuCount: 0, quantity: "0", costValue: "0",
    unknownValueCount: 0, unknownQuantityCount: 0,
  };
  const zero = renderToStaticMarkup(createElement(DataQualityStockFigures, { stock, lang }));
  expect(zero).toContain(lang === "uk" ? "0 SKU · 0 шт · 0 валюта невідома" : "0 SKU · 0 units · 0 currency unknown");
  expect(zero).not.toContain("—");
  expect(zero).not.toContain(lang === "uk" ? "Кількість невідома" : "Unknown quantity");

  const unknown = renderToStaticMarkup(createElement(DataQualityStockFigures, {
    stock: { ...stock, quantity: null, costValue: null, unknownValueCount: 2, unknownQuantityCount: 3 }, lang,
  }));
  expect(unknown).toContain(lang === "uk" ? "0 SKU · — шт · — валюта невідома" : "0 SKU · — units · — currency unknown");
  expect(unknown).toContain(lang === "uk" ? "SKU без оцінки: 2" : "unvalued SKUs: 2");
  expect(unknown).toContain(lang === "uk" ? "Кількість невідома: 3" : "Unknown quantity: 3");
});
it("does not describe missing or unverified stock as a clean catalogue", () => {
  const html = renderToStaticMarkup(createElement(Summary, {
    lang: "uk", affectedStock: [], summary: [], selected: "", onSelect: () => {},
  }));
  expect(html).not.toContain("Проблемного товарного залишку немає.");
  expect(html).toContain("Перевірте типи позицій");
  expect(qualityGuidance("PRODUCT_KIND_UNVERIFIED", "uk")).toContain("основних продажів");
  expect(qualityFixHref("STOCK_QUANTITY_UNAVAILABLE")).not.toContain("salesdrive");
});
it.each(["uk", "en"] as const)(
  "renders localized deduplication, coverage, correction links and group drill-downs in %s",
  (lang) => {
    const group = {
      currency: "UAH",
      skuCount: 1,
      quantity: "330",
      costValue: "433000",
      unknownValueCount: 1,
      unknownQuantityCount: 0,
    };
    const html = renderToStaticMarkup(
      createElement(Summary, {
        lang,
        affectedStock: [group],
        summary: [{ ...group, code: "MISSING_BRAND" }],
        selected: "MISSING_BRAND",
        onSelect: () => {},
      }),
    );
    expect(html).toContain(qualityLabel("MISSING_BRAND", lang));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("433");
    expect(html).toContain("330");
    expect(html).toContain(
      qualityFixHref("MISSING_BRAND").replaceAll("&", "&amp;"),
    );
    expect(html).toContain(
      lang === "en" ? "must not be added together" : "не можна додавати",
    );
    expect(html).toContain(
      lang === "en" ? "Known value only" : "Відома частина вартості",
    );
    expect(qualityGuidance("OWNERSHIP_UNKNOWN", lang)).toBeTruthy();
    expect(qualityFixHref("OWNERSHIP_UNKNOWN")).toBe(
      "/settings?tab=merchandising",
    );
  },
);
it("restores bounded diagnostic state and preserves tabs, hashes and a one-character SKU search", () => {
  expect(
    readQualitySelection(
      new URLSearchParams("qualityPage=NaN&qualityCode=invalid&qualityQ=1"),
    ),
  ).toEqual({ page: 1, code: "", q: "1" });
  const params = writeQualitySelection(
    new URLSearchParams("tab=general&qualityPage=2"),
    { code: "MISSING_COST", page: 1, q: "1" },
  );
  expect(params.get("tab")).toBe("general");
  expect(params.get("qualityQ")).toBe("1");
  expect(params.has("qualityPage")).toBe(false);
  expect(readQualitySelection(params)).toEqual({
    code: "MISSING_COST",
    page: 1,
    q: "1",
  });
});
