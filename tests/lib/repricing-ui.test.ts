import { createElement } from "react";
import { renderToStaticMarkup } from "../helpers/render-localized";
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { repricingCopy } from "@/lib/repricing-copy";
import { readRepricingDraft } from "@/lib/repricing-workspace";
import { calculateRepricing, parseRepricingRequest } from "@/lib/repricing";
import Controls from "@/components/repricing/RepricingControls";
import Summary from "@/components/repricing/RepricingSummary";
import Table from "@/components/repricing/RepricingTable";
import type { RepricingPreview } from "@/components/repricing/useRepricingPreview";
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
