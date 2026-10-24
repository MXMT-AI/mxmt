import { describe, it, expect } from "vitest";
import {
  defaultClientSettings,
  validateClientSettings,
  validateEntitySettings,
} from "@/lib/merchandising-settings";
import {
  resolveMerchandisingPolicy,
  previewMerchandisingCalculations,
} from "@/lib/merchandising-policy";
import {
  applyClientOrderSettings,
  clientOrderFilterFingerprint,
} from "@/lib/merchandising-order-policy";
import { normalizeOrder } from "@/lib/connectors/order-normalization";
import type { OrderDto } from "@/lib/connectors/contract";
describe("client settings contract", () => {
  it("documents approved defaults independently from business-model labels and confirmed source facts", () => {
    const v = defaultClientSettings();
    expect(v).toMatchObject({
      profileMode: "MULTIBRAND",
      minMarginPct: 45,
      turnoverMonths: 3,
      deadDays: 90,
      healthyWohWeeks: 12,
      riskWohWeeks: 26,
      newProductWeeks: 6,
      leadDays: 30,
      coverDays: 60,
      moq: 1,
      saleStatusesVerified: false,
      monthlyPlans: {},
    });
    v.saleStatuses.push("99");
    expect(defaultClientSettings().saleStatuses).not.toContain("99");
    expect(validateClientSettings(defaultClientSettings())).toEqual(
      defaultClientSettings(),
    );
  });
  it.each([
    { deadDays: 61 },
    { minMarginPct: 101 },
    { riskWohWeeks: 10 },
    { moq: 0 },
    { profileMode: "SEASONAL" },
    { saleStatuses: ["5", "5"] },
    { saleStatusesVerified: true, saleStatuses: [] },
    { excludedProjects: ["project"] },
    { monthlyPlans: { "2026-13": "100" } },
    { monthlyPlans: { "2026-10": "bad" } },
    { businessModel: "HYBRID" },
  ])("rejects invalid settings %j", (patch) => {
    expect(() =>
      validateClientSettings({ ...defaultClientSettings(), ...patch }),
    ).toThrow("INVALID_SETTINGS");
  });
  it("preserves zero monthly plans and an omitted plan as different states", () => {
    expect(
      validateClientSettings({
        ...defaultClientSettings(),
        planCurrency: "UAH",
        monthlyPlans: { "2026-10": "0" },
      }).monthlyPlans,
    ).toEqual({ "2026-10": "0" });
    expect(defaultClientSettings().monthlyPlans["2026-10"]).toBeUndefined();
  });
  it("validates distinct ownership inheritance, commissions and season months", () => {
    expect(
      validateEntitySettings("sku", {
        ownershipOverride: null,
        commissionPct: null,
        supplierId: null,
      }),
    ).toMatchObject({ ownershipOverride: null });
    expect(() =>
      validateEntitySettings("brand", {
        ownership: "UNKNOWN",
        commissionPct: 20,
        supplierId: null,
      }),
    ).toThrow();
    expect(() =>
      validateEntitySettings("category", { seasonMonths: [] }),
    ).toThrow();
    expect(() =>
      validateEntitySettings("category", { seasonMonths: [1, 1] }),
    ).toThrow();
    expect(
      validateEntitySettings("category", { seasonMonths: [12, 1] }),
    ).toEqual({ seasonMonths: [1, 12] });
  });
});
describe("persisted policy calculations", () => {
  it("resolves explicit UNKNOWN before confirmed own-stock brand settings", () => {
    const p = resolveMerchandisingPolicy({
      brandOwnership: "OWN",
      ownershipOverride: "UNKNOWN",
    });
    expect(p.ownership).toBe("UNKNOWN");
    expect(
      previewMerchandisingCalculations(p, {
        revenue: "100",
        cost: "40",
        weeklyVelocity: "7",
        stock: "10",
        inTransit: "0",
        month: 1,
      }).grossProfit,
    ).toBeNull();
  });
  it("inherits consignment commission and permits an explicit SKU rate override", () => {
    expect(
      resolveMerchandisingPolicy({
        brandOwnership: "CONSIGNMENT",
        brandCommissionRate: "0.4",
      }).commissionRate,
    ).toBe("0.4");
    expect(
      resolveMerchandisingPolicy({
        brandOwnership: "CONSIGNMENT",
        brandCommissionRate: "0.4",
        commissionRateOverride: "0.5",
      }).commissionRate,
    ).toBe("0.5");
    expect(
      resolveMerchandisingPolicy({
        brandOwnership: "OWN",
        brandCommissionRate: "0.4",
        ownershipOverride: "CONSIGNMENT",
      }).commissionRate,
    ).toBeNull();
  });
  it("uses supplier terms, MOQ and seasons, preserving unknown transit and zero demand", () => {
    const p = resolveMerchandisingPolicy({
      supplierId: "s",
      moq: 6,
      brandOwnership: "CONSIGNMENT",
      brandCommissionRate: "0.4",
    });
    const input = {
      revenue: "100",
      cost: null,
      weeklyVelocity: "7",
      stock: "10",
      inTransit: "5",
      month: 1,
    };
    expect(previewMerchandisingCalculations(p, input)).toMatchObject({
      grossProfit: "40",
      orderQuantity: "78",
    });
    expect(
      previewMerchandisingCalculations(p, { ...input, inTransit: null })
        .orderQuantity,
    ).toBeNull();
    expect(
      previewMerchandisingCalculations(p, {
        ...input,
        weeklyVelocity: "0",
        inTransit: null,
      }).orderQuantity,
    ).toBe("0");
    expect(
      previewMerchandisingCalculations({ ...p, seasonMonths: [6] }, input)
        .orderQuantity,
    ).toBe("0");
  });
});
const order: OrderDto = {
  externalId: "1",
  observedAt: "2026-10-25T12:00:00Z",
  updatedAt: null,
  orderedAt: "2026-10-01",
  paidAt: "2026-10-02",
  statusId: "59",
  channelId: "web",
  raw: { projectId: "excluded" },
  lines: [
    {
      externalLineId: "1",
      productId: null,
      sku: "SKU",
      quantity: "2",
      unitPrice: "100",
      discount: "0",
      discountUnit: "amount",
      costPrice: "40",
      commission: null,
      commissionUnit: "unknown",
    },
  ],
};
describe("active settings in import calculations", () => {
  it("does not activate unverified default sale status IDs", () => {
    const p = applyClientOrderSettings(
      { statuses: { "5": "SALE", "7": "RETURN" } },
      defaultClientSettings(),
      { id: "c", revision: 1 },
    );
    expect(p.statuses?.["59"]).toBeUndefined();
    expect(p.statuses?.["7"]).toBe("RETURN");
  });
  it("applies confirmed status and exclusion rules without dropping raw values", () => {
    const c = {
      ...defaultClientSettings(),
      saleStatusesVerified: true,
      excludedProjects: ["excluded"],
      projectField: "projectId",
    };
    const p = applyClientOrderSettings(
      {
        amounts: {
          price: "gross_unit",
          absoluteDiscount: "line",
          currency: "UAH",
          cost: "unit",
        },
      },
      c,
      { id: "c", revision: 2 },
    );
    const value = normalizeOrder(order, "Europe/Kyiv", p);
    expect(value.lines[0]).toMatchObject({
      kind: "SALE",
      signedRevenue: null,
      normalization: {
        settingsRevision: 2,
        excluded: true,
        exclusionReason: "EXCLUDED_PROJECT",
      },
    });
    expect(value.lines[0].netAmount?.toString()).toBe("200");
    expect(value.issues).toContain("EXCLUDED_PROJECT");
  });
  it("exposes incomplete project mapping instead of admitting possibly excluded revenue", () => {
    const p = applyClientOrderSettings(
      {
        statuses: { "59": "SALE" },
        amounts: {
          price: "net_unit",
          absoluteDiscount: "line",
          currency: "UAH",
        },
      },
      {
        ...defaultClientSettings(),
        excludedProjects: ["excluded"],
        projectField: "missing",
      },
      { id: "c", revision: 3 },
    );
    const value = normalizeOrder(order, "Europe/Kyiv", p);
    expect(value.lines[0].signedRevenue).toBeNull();
    expect(value.issues).toContain("PROJECT_MAPPING_UNVERIFIED");
  });
});

import { evaluateMonthlyPlan } from "@/lib/merchandising-policy";
describe("currency-aware monthly targets", () => {
  it("calculates attainment from saved target and keeps missing/zero targets unavailable", () => {
    const c = {
      ...defaultClientSettings(),
      planCurrency: "UAH",
      monthlyPlans: { "2026-10": "200", "2026-11": "0" },
    };
    expect(evaluateMonthlyPlan(c, "2026-10", "100")).toMatchObject({
      attainmentPct: "50",
      currency: "UAH",
    });
    expect(evaluateMonthlyPlan(c, "2026-11", "100").attainmentPct).toBeNull();
    expect(evaluateMonthlyPlan(c, "2026-12", "100").amount).toBeNull();
    expect(() =>
      validateClientSettings({
        ...defaultClientSettings(),
        monthlyPlans: { "2026-10": "200" },
      }),
    ).toThrow();
  });
});

describe("order replay scope", () => {
  it("invalidates projections only for changed ingestion filters, including malformed project IDs", () => {
    const c = defaultClientSettings();
    expect(clientOrderFilterFingerprint({ ...c, minMarginPct: 55 })).toBe(
      clientOrderFilterFingerprint(c),
    );
    expect(
      clientOrderFilterFingerprint({ ...c, excludedChannels: ["web"] }),
    ).not.toBe(clientOrderFilterFingerprint(c));
    const policy = applyClientOrderSettings(
      {
        statuses: { "59": "SALE" },
        amounts: {
          price: "net_unit",
          absoluteDiscount: "line",
          currency: "UAH",
        },
      },
      { ...c, excludedProjects: ["excluded"], projectField: "projectId" },
      { id: "c", revision: 1 },
    );
    for (const raw of [{ projectId: { id: "excluded" } }, { projectId: true }])
      expect(
        normalizeOrder({ ...order, raw }, "Europe/Kyiv", policy).lines[0]
          .signedRevenue,
      ).toBeNull();
  });
});
