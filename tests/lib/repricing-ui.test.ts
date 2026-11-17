import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "../helpers/render-localized";
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { repricingCopy } from "@/lib/repricing-copy";
import { readRepricingDraft } from "@/lib/repricing-workspace";
import { calculateRepricing, parseRepricingRequest } from "@/lib/repricing";
import Controls from "@/components/repricing/repricing-controls/repricing-controls";
import Summary from "@/components/repricing/repricing-summary/repricing-summary";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { RepricingPriceCell } from "@/components/repricing/repricing-price-cell/repricing-price-cell";
import { RepricingDiscountCell } from "@/components/repricing/repricing-discount-cell/repricing-discount-cell";
import Table from "@/components/repricing/repricing-table/repricing-table";
import type { RepricingPreview } from "@/components/repricing/use-repricing-preview";
import { repricingUiSkus } from "../helpers/repricing-workspace";
const data = {
  ...calculateRepricing(
    {
      id: "inputs",
      snapshotId: "frozen",
      asOf: "2026-10-25",
      rows: repricingUiSkus,
    },
    parseRepricingRequest({
      inputSetId: "inputs",
      filters: { status: "DEAD_OR_RISK" },
    }),
  ),
  pagination: { page: 1, pageSize: 25, totalRows: 32, totalPages: 2 },
  context: {},
  windows: {},
  historyUnavailableReason: null,
} as unknown as RepricingPreview;
describe("localized accessible Repricing workspace", () => {
  it("does not display zero cash outcomes as calculated benefits when no SKU is eligible", () => {
    const html = renderToStaticMarkup(createElement(Summary, { data: { ...data, counts: { ...data.counts, eligibleSkuCount: 0 } }, current: true, copy: repricingCopy.en, locale: "en-US" }));
    expect(html).not.toContain('<small class="ml-1 text-xs">UAH</small>');
    expect(html).toContain("—");
  });
  it.each(["uk", "en"] as const)(
    "renders R1–R4 controls and server totals in %s",
    (lang) => {
      const copy = repricingCopy[lang],
        locale = lang === "uk" ? "uk-UA" : "en-US";
      const controls = renderToStaticMarkup(
        createElement(Controls, {
          draft: readRepricingDraft(new URLSearchParams()),
          copy,
          data,
          error: null,
          onChange: () => {},
        }),
      );
      expect(controls).toContain(copy.reset);
      expect(controls).toContain('type="range"');
      expect(controls).toContain('step="5"');
      expect(controls).toContain(copy.goals.CAPITAL);
      expect(controls).not.toContain("Calculate");
      expect(controls).not.toContain("Розрахувати");
      const table = renderToStaticMarkup(
        createElement(Table, {
          data,
          edits: { manualPrices: [], selection: [] },
          copy,
          locale,
          canEdit: true,
          settled: true,
          error: null,
          onPrice: () => {},
          onSelection: () => {},
          onPage: () => {},
        }),
      );
      expect(table).toContain('aria-label="' + copy.newPrice + ":");
      expect(table).toContain(copy.consignment);
      expect(table).toContain('disabled=""');
      expect(table).toContain(copy.statuses.DEAD);
      expect(table).toContain("Time Studio");
      const summary = renderToStaticMarkup(
        createElement(Summary, { data, current: true, copy, locale }),
      );
      expect(summary).toContain(copy.weighted);
      expect(summary).toContain(copy.csvReady);
      expect(summary).toContain('disabled=""');
    },
  );
  it("hides obsolete totals while the latest scenario is pending", () => {
    const html = renderToStaticMarkup(
      createElement(Summary, {
        data,
        current: false,
        copy: repricingCopy.en,
        locale: "en-US",
      }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("UAH");
  });
  it("marks rejected manual prices inline, preserving the exact draft", () => {
    const html = renderToStaticMarkup(
      createElement(Table, {
        data,
        edits: {
          manualPrices: [{ skuId: "sku-1", price: "0.01" }],
          selection: [],
        },
        copy: repricingCopy.en,
        locale: "en-US",
        canEdit: true,
        settled: false,
        error: {
          code: "INVALID_MANUAL_REPRICING_PRICE",
          details: ["manualPrices.sku-1: COST_FLOOR_VIOLATION"],
        },
        onPrice: () => {},
        onSelection: () => {},
        onPage: () => {},
      }),
    );
    expect(html).toContain('value="0.01"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(repricingCopy.en.manual);
    expect(html).toContain(repricingCopy.en.manualError);
  });
});


function summaryNodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(summaryNodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...summaryNodes(node.props.children)];
}

it.each([
  { current: false, exporting: false, withExport: true, disabled: true },
  { current: true, exporting: true, withExport: true, disabled: true },
  { current: true, exporting: false, withExport: false, disabled: true },
  { current: true, exporting: false, withExport: true, disabled: false },
])("keeps summary export availability for %j", ({ current, exporting, withExport, disabled }) => {
  const onExport = vi.fn();
  const tree = summaryNodes(Summary({ data, current, exporting, copy: repricingCopy.en, locale: "en-US", onExport: withExport ? onExport : undefined }));
  const action = tree.find(node => node.props["aria-describedby"] === "repricing-export-note")!.props;
  expect(action.disabled).toBe(disabled);
  if (!disabled) {
    action.onClick();
    expect(onExport).toHaveBeenCalledOnce();
  }
});

it.each(["uk", "en"] as const)("preserves zero money, unavailable money and revenue emphasis in %s", lang => {
  const copy = repricingCopy[lang];
  const zero = { ...data, counts: { ...data.counts, eligibleSkuCount: 1 }, totals: { ...data.totals, costCapital: "0", potentialRevenue: null, grossProfit: "0" } } as unknown as RepricingPreview;
  const html = renderToStaticMarkup(createElement(Summary, { data: zero, current: true, copy, locale: lang === "uk" ? "uk-UA" : "en-US" }));
  expect(html).toContain('aria-describedby="repricing-export-note"');
  expect(html).toContain('id="repricing-export-note"');
  expect((html.match(/<small class="ml-1 text-xs">UAH<\/small>/g) ?? [])).toHaveLength(2);
  const revenue = html.match(/<dd[^>]*scenario-key-value[^>]*>(.*?)<\/dd>/)![1];
  expect(revenue).toBe("—");
  const stale = renderToStaticMarkup(createElement(Summary, { data: zero, current: false, copy, locale: "en-US" }));
  expect((stale.match(/<dd[^>]*>—<\/dd>/g) ?? [])).toHaveLength(7);
  expect(stale).not.toContain("UAH");
  const noEligible = renderToStaticMarkup(createElement(Summary, { data: { ...zero, counts: { ...zero.counts, eligibleSkuCount: 0 } }, current: true, copy, locale: "en-US" }));
  expect(noEligible).not.toContain("UAH");
});


it("keeps manual price drafts blank and restores automatic pricing with null", () => {
  const row = { ...data.rows[0], eligible: true, newPrice: "99.00" };
  const onPrice = vi.fn();
  const tree = summaryNodes(RepricingPriceCell({ row, value: "", edited: true, invalid: true, copy: repricingCopy.en, canEdit: true, onPrice }));
  const input = tree.find(node => node.type === "input")!.props;
  expect(input.value).toBe("");
  expect(input["aria-describedby"]).toBe(`repricing-price-${row.skuId}`);
  input.onChange({ target: { value: "12.50" } });
  expect(onPrice).toHaveBeenLastCalledWith(row.skuId, "12.50");
  tree.find(node => node.type === "button")!.props.onClick();
  expect(onPrice).toHaveBeenLastCalledWith(row.skuId, null);
});

it.each([
  { canEdit: true, settled: false, eligible: true, priceDisabled: false, selectionDisabled: true },
  { canEdit: true, settled: true, eligible: true, priceDisabled: false, selectionDisabled: false },
  { canEdit: false, settled: true, eligible: true, priceDisabled: true, selectionDisabled: true },
  { canEdit: true, settled: true, eligible: false, priceDisabled: true, selectionDisabled: true },
])("preserves distinct price and selection permissions for %j", ({ canEdit, settled, eligible, priceDisabled, selectionDisabled }) => {
  const tree = summaryNodes(Table({ data, edits: { manualPrices: [], selection: [] }, copy: repricingCopy.en, locale: "en-US", canEdit, settled, error: null, onPrice: vi.fn(), onSelection: vi.fn(), onPage: vi.fn() }));
  const table = tree.find(node => node.type === ReportTable)!.props;
  const row = { ...data.rows[0], eligible };
  const price = table.renderCell(row, { key: "newPrice" });
  const input = summaryNodes(RepricingPriceCell(price.props)).find(node => node.type === "input")!.props;
  expect(input.disabled).toBe(priceDisabled);
  const selection = summaryNodes(table.renderCell(row, { key: "include" })).find(node => node.type === "input")!.props;
  expect(selection.disabled).toBe(selectionDisabled);
  if (!settled) {
    expect(table.renderCell(row, { key: "margin" })).toBe("—");
    const discount = table.renderCell(row, { key: "effectiveDiscount" });
    expect(RepricingDiscountCell(discount.props)).toBe("—");
  }
});

it.each(["manualPrices.0.price: invalid", "manualPrices.z: COST_FLOOR_VIOLATION"])("maps manual error %s to the original request order", detail => {
  const tree = summaryNodes(Table({ data, edits: { manualPrices: [{ skuId: "z", price: "" }, { skuId: "a", price: "2" }], selection: [] }, copy: repricingCopy.en, locale: "en-US", canEdit: true, settled: false, error: { code: "INVALID_MANUAL_REPRICING_PRICE", details: [detail] }, onPrice: vi.fn(), onSelection: vi.fn(), onPage: vi.fn() }));
  const table = tree.find(node => node.type === ReportTable)!.props;
  const price = (skuId: string) => table.renderCell({ ...data.rows[0], skuId }, { key: "newPrice" }).props;
  expect(price("z").invalid).toBe(true);
  expect(price("a").invalid).toBe(false);
  expect(price("other").invalid).toBe(false);
  expect(price("z").value).toBe("");
});

it("preserves pagination callbacks and disables navigation while calculating", () => {
  const onPage = vi.fn();
  const props = { data, edits: { manualPrices: [], selection: [] }, copy: repricingCopy.en, locale: "en-US", canEdit: true, settled: true, error: null, onPrice: vi.fn(), onSelection: vi.fn(), onPage };
  const actions = (settled: boolean) => summaryNodes(Table({ ...props, settled })).filter(node => [repricingCopy.en.previous, repricingCopy.en.next].includes(node.props.children));
  expect(actions(true)[0].props.disabled).toBe(true);
  expect(actions(true)[1].props.disabled).toBe(false);
  actions(true)[1].props.onClick();
  expect(onPage).toHaveBeenCalledWith(2);
  expect(actions(false).every(node => node.props.disabled)).toBe(true);
});
