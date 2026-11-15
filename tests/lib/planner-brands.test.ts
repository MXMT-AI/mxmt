import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PlannerBrands } from "@/components/planner/planner-brands/planner-brands";
import { Button } from "@/components/ui/button/button";
import type { Brand, CatalogUpload } from "@/components/planner/planner-types";
const first: Brand = { id: "a", name: "Alpha", budget: 100, paymentDays: 30, currency: "EUR", country: "Italy", contact: null, leadTimeDays: 28, moq: 1 };
const second = { ...first, id: "b", name: "Beta", currency: "USD", budget: 200, country: null };
const catalog = (id: string, brandId: string): CatalogUpload => ({ id, brandId, season: "SS26", itemCount: 10, uploadedAt: "2026-01-01", brand: { name: brandId } });
it("shows the empty state without edit buttons", () => {
  const html = renderToStaticMarkup(createElement(PlannerBrands, { brands: [], catalogs: [], onEdit: vi.fn(), fmt: String }));
  expect(html).toContain("Брендів ще немає");
  expect(html).not.toContain("<button");
});
it("counts catalogs for each brand and ignores unrelated catalogs", () => {
  const html = renderToStaticMarkup(createElement(PlannerBrands, {
    brands: [first, second, { ...first, id: "__proto__", name: "Special" }, { ...first, id: "empty", name: "Empty" }],
    catalogs: [catalog("1", "a"), catalog("2", "a"), catalog("3", "b"), catalog("4", "unknown"), catalog("5", "__proto__")], onEdit: vi.fn(), fmt: String,
  }));
  expect(html.match(/2 каталогів/g)).toHaveLength(1);
  expect(html.match(/1 каталогів/g)).toHaveLength(2);
  expect(html.match(/0 каталогів/g)).toHaveLength(1);
  for (const text of ["Budget: EUR100", "Budget: USD200", "Net 30d", "Lead 28d", "Italy"]) expect(html).toContain(text);
});
it("uses native non-submit buttons and forwards the selected brand", () => {
  const onEdit = vi.fn();
  const tree = PlannerBrands({ brands: [first, second], catalogs: [], onEdit, fmt: String });
  const cards = tree.props.children[1].props.children;
  for (const [index, card] of cards.entries()) {
    expect(isValidElement(card)).toBe(true);
    expect(card.type).toBe(Button);
    const button = Button(card.props);
    expect(button.type).toBe("button");
    expect(button.props.type).toBe("button");
    expect(button.props["aria-label"]).toBe(`Редагувати бренд ${index ? "Beta" : "Alpha"}`);
    button.props.onClick!({} as never);
  }
  expect(onEdit.mock.calls).toEqual([[first], [second]]);
});
