import { createElement, isValidElement, type ReactNode } from "react";
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
import Controls from "@/components/reordering/reordering-controls/reordering-controls";
import { ReorderingTransitCell } from "@/components/reordering/reordering-transit-cell/reordering-transit-cell";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import Table from "@/components/reordering/reordering-table/reordering-table";
import Summary from "@/components/reordering/reordering-summary/reordering-summary";
import { ReorderingSupplierGroups } from "@/components/reordering/reordering-supplier-groups/reordering-supplier-groups";
import type { ReorderingPreview } from "@/components/reordering/reordering-editor/reordering-editor";
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
        createElement(ReorderingSupplierGroups, { data, copy, locale }),
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

function controlNodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(controlNodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...controlNodes(node.props.children)];
}

it.each([false, true])("preserves mode selection and reset for monobrand=%s", (monobrand) => {
  const draft = readReorderingDraft(new URLSearchParams("leadDays=0&supplierId=supplier-a"));
  const onChange = vi.fn(), onReset = vi.fn();
  const nodes = controlNodes(Controls({ monobrand, draft, data, error: null, copy: reorderingCopy.en, onChange, onReset }));
  const modes = nodes.filter(node => "aria-pressed" in node.props);
  expect(modes.map(node => node.props.children)).toEqual([
    reorderingCopy.en.modes.shortage,
    reorderingCopy.en.modes[monobrand ? "all" : "brand"],
  ]);
  expect(modes[0].props["aria-pressed"]).toBe(true);
  modes[1].props.onClick();
  expect(onChange).toHaveBeenCalledWith({ ...draft, mode: monobrand ? "all" : "brand" });
  nodes.find(node => node.props.children === reorderingCopy.en.reset)!.props.onClick();
  expect(onReset).toHaveBeenCalledOnce();
});

it("clears only contextual filters while keeping supplier, brand and parameters", () => {
  const draft = readReorderingDraft(new URLSearchParams("brandId=b&supplierId=s&categoryId=c&skuId=sku&currency=EUR&leadDays=0&coverDays=60"));
  const onChange = vi.fn();
  const nodes = controlNodes(Controls({ draft, data, error: null, copy: reorderingCopy.en, onChange, onReset: vi.fn() }));
  nodes.find(node => node.props.children === reorderingCopy.en.clearContext)!.props.onClick();
  expect(onChange).toHaveBeenCalledWith({ ...draft, filters: { brandId: "b", supplierId: "s" } });
  expect(draft.filters.skuId).toBe("sku");
});

it("keeps parameter errors scoped to their fields and preserves blank inheritance", () => {
  const draft = readReorderingDraft(new URLSearchParams("leadDays=-1"));
  const onChange = vi.fn();
  const props = { draft, data, error: { code: "INVALID_REORDERING_REQUEST", details: ["parameters.leadDays: invalid", "filters.brandId: invalid"] }, copy: reorderingCopy.en, onChange, onReset: vi.fn() };
  const nodes = controlNodes(Controls(props));
  const lead = nodes.find(node => node.type === "input" && node.props.name === "leadDays")!.props;
  const cover = nodes.find(node => node.type === "input" && node.props.name === "coverDays")!.props;
  expect(lead["aria-invalid"]).toBe(true);
  expect(lead["aria-describedby"]).toBe("reordering-field-error");
  expect(cover["aria-invalid"]).toBe(false);
  expect(cover["aria-describedby"]).toBe("reordering-settings-note");
  expect(cover.value).toBe("");
  expect(cover.placeholder).toBe(`${reorderingCopy.en.settings} (60)…`);
  lead.onChange({ target: { value: "" } });
  expect(onChange).toHaveBeenCalledWith({ ...draft, leadDays: "" });
  const filterOnly = controlNodes(Controls({ ...props, error: { ...props.error, details: ["filters.brandId: invalid"] } }));
  expect(filterOnly.some(node => node.props.id === "reordering-field-error")).toBe(false);
});


it("keeps zero confirmation, blank editing and restore callbacks tied to the SKU", () => {
  const row = { ...data.rows[0], shortageEligible: true, state: "SHORTAGE" as const, inTransitQuantity: null };
  const onTransit = vi.fn(), onRestore = vi.fn();
  const props = { row, value: undefined, edited: false, invalid: false, copy: reorderingCopy.en, onTransit, onRestore };
  const initial = controlNodes(ReorderingTransitCell(props));
  initial.find(node => node.props.children === reorderingCopy.en.confirmZero)!.props.onClick();
  expect(onTransit).toHaveBeenCalledWith(row.skuId, "0");
  const edited = controlNodes(ReorderingTransitCell({ ...props, value: "", edited: true }));
  const input = edited.find(node => node.type === "input")!.props;
  expect(input.value).toBe("");
  input.onChange({ target: { value: "12" } });
  expect(onTransit).toHaveBeenLastCalledWith(row.skuId, "12");
  edited.find(node => node.props.children === reorderingCopy.en.restore)!.props.onClick();
  expect(onRestore).toHaveBeenCalledWith(row.skuId);
  const excluded = controlNodes(ReorderingTransitCell({ ...props, row: { ...row, state: "EXCLUDED" } }));
  expect(excluded.find(node => node.type === "input")!.props.disabled).toBe(true);
  expect(excluded.some(node => node.props.children === reorderingCopy.en.confirmZero)).toBe(false);
});

it("aligns transit errors with sorted nonempty overrides and hides stale amounts", () => {
  const tree = controlNodes(Table({ data, current: false, monobrand: false, transit: { z: "9", a: "-1", empty: "" }, error: { code: "INVALID_REORDERING_REQUEST", details: ["overrides.0.inTransitQuantity: invalid"] }, copy: reorderingCopy.en, locale: "en-GB", onTransit: vi.fn(), onRestore: vi.fn(), onPage: vi.fn() }));
  const table = tree.find(node => node.type === ReportTable)!.props;
  const cell = (skuId: string) => table.renderCell({ ...data.rows[0], skuId }, { key: "inTransitQuantity" }).props;
  expect(cell("a").invalid).toBe(true);
  expect(cell("z").invalid).toBe(false);
  expect(cell("empty").invalid).toBe(false);
  expect(cell("other").invalid).toBe(false);
  expect(table.renderCell(data.rows[0], { key: "purchaseAmount" })).toBe("—");
  expect(table.renderCell(data.rows[0], { key: "recommendedQuantity" }).props.children).toBe("—");
  expect(tree.filter(node => "disabled" in node.props && "onClick" in node.props).every(node => node.props.disabled)).toBe(true);
});
