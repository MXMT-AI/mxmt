import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect } from "vitest";
import ReportReadiness from "@/components/merchandising/ReportReadiness";
const complete = { scope: "SOURCE_SNAPSHOT" as const, total: 10, missingStock: 0, missingReceipt: 0, missingVelocity: 0, unknownOwnership: 0, unknownKind: 0, unclassified: 0 };
it("does not show missing evidence when frozen inputs are complete", () => {
  expect(renderToStaticMarkup(createElement(ReportReadiness, { data: complete, lang: "uk" }))).toBe("");
});
it.each(["uk", "en"] as const)("explains scoped missing evidence and links to corrections in %s", lang => {
  const html = renderToStaticMarkup(createElement(ReportReadiness, { data: { ...complete, missingStock: 4, missingReceipt: 7, missingVelocity: 6, unknownOwnership: 8, unknownKind: 2, unclassified: 9 }, lang }));
  expect(html).toContain("<aside");
  expect(html).toContain("/settings?tab=merchandising");
  expect(html).toContain("#data-quality-title");
  expect(html).toContain(lang === "uk" ? "не означають" : "does not prove");
  expect(html).toContain(lang === "uk" ? "поточні фільтри" : "display filters");
});
