import { createElement } from "react";
import { renderToStaticMarkup } from "../helpers/render-localized";
import { it, expect } from "vitest";
import Summary from "@/components/settings/DataQualitySummary";
import {
  readQualitySelection,
  writeQualitySelection,
} from "@/lib/data-quality-navigation";
import {
  qualityLabel,
  qualityGuidance,
  qualityFixHref,
} from "@/lib/data-quality-copy";
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
