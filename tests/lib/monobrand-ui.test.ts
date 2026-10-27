import { createElement } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { calculateRepricing, parseRepricingRequest } from "@/lib/repricing";
import {
  calculateReordering,
  parseReorderingRequest,
} from "@/lib/reorder-calc";
import { repricingUiSkus } from "../helpers/repricing-workspace";
import { reorderingUiSkus } from "../helpers/reordering-workspace";
import RepriceControls from "@/components/repricing/RepricingControls";
import RepriceTable from "@/components/repricing/RepricingTable";
import ReorderControls from "@/components/reordering/ReorderingControls";
import ReorderTable from "@/components/reordering/ReorderingTable";
import type { RepricingPreview } from "@/components/repricing/useRepricingPreview";
import type { ReorderingPreview } from "@/components/reordering/ReorderingEditor";
import { readRepricingDraft } from "@/lib/repricing-workspace";
import { readReorderingDraft } from "@/lib/reordering-workspace";
import { repricingCopy } from "@/lib/repricing-copy";
import { reorderingCopy } from "@/lib/reordering-copy";
import { profileFilters, profileReordering } from "@/lib/merchandising-profile";
const noop = () => {};
it.each(["uk", "en"] as const)(
  "hides brand selectors/row labels and offers all products for monobrand actions in %s",
  (lang) => {
    const rp = {
      ...calculateRepricing(
        {
          id: "input",
          snapshotId: "snapshot",
          asOf: "2026-10-25",
          rows: repricingUiSkus,
        },
        parseRepricingRequest({ inputSetId: "input" }),
      ),
      pagination: { page: 1, pageSize: 25, totalRows: 36, totalPages: 2 },
    } as unknown as RepricingPreview;
    const ro = {
      ...calculateReordering(
        { snapshotId: "snapshot", asOf: "2026-10-25", rows: reorderingUiSkus },
        parseReorderingRequest({ snapshotId: "snapshot", mode: "all" }),
      ),
      pagination: { page: 1, pageSize: 25, totalRows: 36, totalPages: 2 },
      defaults: { clientPolicy: { leadDays: 30, coverDays: 60, moq: 1 } },
      filterOptions: {
        brands: [{ id: "b", name: "Visible brand marker" }],
        suppliers: [],
      },
    } as unknown as ReorderingPreview;
    const c = repricingCopy[lang],
      rc = reorderingCopy[lang];
    const controls = render(
      createElement(RepriceControls, {
        monobrand: true,
        draft: readRepricingDraft(new URLSearchParams()),
        data: rp,
        error: null,
        copy: c,
        onChange: noop,
      }),
    );
    expect(controls).not.toContain(`>${c.brand}<`);
    const table = render(
      createElement(RepriceTable, {
        monobrand: true,
        data: rp,
        edits: { selection: [], manualPrices: [] },
        copy: c,
        locale: "en-GB",
        canEdit: true,
        settled: true,
        error: null,
        onSelection: noop,
        onPrice: noop,
        onPage: noop,
      }),
    );
    for (const name of new Set(rp.rows.map((r) => r.brandName).filter(Boolean)))
      expect(table).not.toContain(name);
    const controls2 = render(
      createElement(ReorderControls, {
        monobrand: true,
        draft: { ...readReorderingDraft(new URLSearchParams()), mode: "all" },
        data: ro,
        error: null,
        copy: rc,
        onChange: noop,
        onReset: noop,
      }),
    );
    expect(controls2).toContain(rc.modes.all);
    expect(controls2).toContain(rc.scopeNoteMono);
    expect(controls2).not.toContain(rc.scopeNote);
    expect(controls2).not.toContain(rc.modes.brand);
    expect(controls2).not.toContain("Visible brand marker");
    const table2 = render(
      createElement(ReorderTable, {
        monobrand: true,
        data: ro,
        copy: rc,
        locale: "en-GB",
        current: true,
        transit: {},
        error: null,
        onTransit: noop,
        onRestore: noop,
        onPage: noop,
      }),
    );
    for (const name of new Set(ro.rows.map((r) => r.brandName).filter(Boolean)))
      expect(table2).not.toContain(name);
  },
);
it("canonicalizes old monobrand filters without mutating a multibrand selection", () => {
  const selection = {
    mode: "brand" as const,
    filters: { brandId: "old", categoryId: "cat" },
  };
  expect(profileReordering(selection, true)).toEqual({
    mode: "all",
    filters: { categoryId: "cat" },
  });
  expect(profileReordering(selection, false)).toBe(selection);
  expect(profileFilters(selection.filters, false)).toBe(selection.filters);
  expect(selection.filters.brandId).toBe("old");
});
