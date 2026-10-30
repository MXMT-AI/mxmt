import { createElement } from "react";
import { renderToStaticMarkup } from "../helpers/render-localized";
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  calculateReordering,
  parseReorderingRequest,
} from "@/lib/reorder-calc";
import { readReorderingDraft } from "@/lib/reordering-workspace";
import { reorderingCopy } from "@/lib/reordering-copy";
import { reorderingUiSkus } from "../helpers/reordering-workspace";
import Controls from "@/components/reordering/ReorderingControls";
import Table from "@/components/reordering/ReorderingTable";
import Summary, {
  SupplierGroups,
} from "@/components/reordering/ReorderingSummary";
import type { ReorderingPreview } from "@/components/reordering/ReorderingEditor";
const calculation = calculateReordering(
  { snapshotId: "frozen", asOf: "2026-10-25", rows: reorderingUiSkus },
  parseReorderingRequest({ snapshotId: "frozen" }),
);
const data = {
  ...calculation,
  context: {},
  defaults: {
    mode: "shortage",
    parameters: {},
    clientPolicy: { leadDays: 30, coverDays: 60, moq: 1 },
  },
  filterOptions: {
    brands: [
      { id: "brand-a", name: "Play Studio" },
      { id: "brand-b", name: "Field Works" },
    ],
    suppliers: [
      { id: "supplier-a", name: "Play Supply" },
      { id: "supplier-b", name: "Field Supply" },
    ],
  },
  pagination: {
    page: 1,
    pageSize: 25,
    totalRows: calculation.rows.length,
    totalPages: 2,
  },
  capabilities: { preview: true, export: false, execute: false },
} as ReorderingPreview;
describe("localized reordering UI", () => {
  it.each(["uk", "en"] as const)(
    "renders both modes, supplier settings, server totals and CSV boundaries in %s",
    (lang) => {
      const copy = reorderingCopy[lang],
        locale = lang === "uk" ? "uk-UA" : "en-US";
      const controls = renderToStaticMarkup(
        createElement(Controls, {
          draft: readReorderingDraft(new URLSearchParams()),
          data,
          error: null,
          copy,
          onChange: () => {},
          onReset: () => {},
        }),
      );
      expect(controls).toContain(copy.modes.shortage);
      expect(controls).toContain(copy.modes.brand);
      expect(controls).toContain(copy.inherit);
      expect(controls).toContain('name="leadDays"');
      expect(controls).toContain("Play Studio");
      expect(controls).not.toContain("Calculate");
      const table = renderToStaticMarkup(
        createElement(Table, {
          data,
          copy,
          locale,
          current: true,
          transit: {},
          error: null,
          onTransit: () => {},
          onRestore: () => {},
          onPage: () => {},
        }),
      );
      expect(table).toContain(copy.barcode);
      expect(table).toContain(copy.offSeason);
      expect(table).toContain(copy.urgent);
      expect(table).toContain(copy.confirmZero);
      expect(table).toContain('disabled=""');
      expect(table).not.toContain("CLASSIFICATION_REVIEW_REQUIRED");
      const summary = renderToStaticMarkup(
        createElement(Summary, { data, current: true, copy, locale }),
      );
      expect(summary).toContain(copy.partial);
      expect(summary).toContain(copy.csvReady);
      expect(summary).toContain("USD");
      expect(summary).toContain("UAH");
      const groups = renderToStaticMarkup(
        createElement(SupplierGroups, { data, copy, locale }),
      );
      expect(groups).toContain("Play Supply");
      expect(groups).toContain("Field Supply");
      expect(groups).toContain(copy.supplierNote);
    },
  );
  it("hides stale cash totals and recommendations during a pending or rejected scenario", () => {
    const copy = reorderingCopy.en,
      html = renderToStaticMarkup(
        createElement(Summary, { data, current: false, copy, locale: "en-US" }),
      );
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("USD");
    expect(html).not.toContain("UAH");
  });
  it("keeps an invalid transit draft editable with a localized inline error", () => {
    const html = renderToStaticMarkup(
      createElement(Table, {
        data,
        copy: reorderingCopy.en,
        locale: "en-US",
        current: false,
        transit: { "sku-01": "-1" },
        error: {
          code: "INVALID_REORDERING_REQUEST",
          details: [
            "overrides.0.inTransitQuantity: expected a non-negative decimal string",
          ],
        },
        onTransit: () => {},
        onRestore: () => {},
        onPage: () => {},
      }),
    );
    expect(html).toContain('value="-1"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(reorderingCopy.en.transitError);
    expect(html).toContain(reorderingCopy.en.restore);
  });
});

it("keeps a cleared saved transit field blank and aligns errors after omitted empty drafts", () => {
  const html = renderToStaticMarkup(
    createElement(Table, {
      data,
      copy: reorderingCopy.en,
      locale: "en-US",
      current: false,
      transit: { "sku-00": "", "sku-01": "-1" },
      error: {
        code: "INVALID_REORDERING_REQUEST",
        details: ["overrides.0.inTransitQuantity: invalid quantity"],
      },
      onTransit: () => {},
      onRestore: () => {},
      onPage: () => {},
    }),
  );
  expect(html).toMatch(/name="transit-sku-00"[^>]*value=""/);
  expect(html).toContain(reorderingCopy.en.clearedTransit);
  expect(html).toMatch(/aria-invalid="true"[^>]*name="transit-sku-01"/);
  expect(html).toContain(reorderingCopy.en.transitError);
});
