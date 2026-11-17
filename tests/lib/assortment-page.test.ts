import { beforeEach, expect, it, vi } from "vitest";
import AssortmentPage from "@/components/assortment/assortment-page/assortment-page";
import PlannerApp from "@/components/planner/planner-app";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), locale: vi.fn(), redirect: vi.fn(), brands: vi.fn(), catalogs: vi.fn(), cart: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next-intl/server", () => ({ getLocale: mocks.locale }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/prisma", () => ({ prisma: { brand: { findMany: mocks.brands }, catalogUpload: { findMany: mocks.catalogs }, plannerCart: { findUnique: mocks.cart } } }));

const item = { catalogItemId: "item", sku: "sku", name: "Coat", brandId: "brand", brandName: "Demo", category: "Coats", price: 0, currency: "UAH", qty: 1, minOrder: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ "x-tenant-id": "demo" }));
  mocks.locale.mockResolvedValue("uk");
  mocks.redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
  mocks.brands.mockResolvedValue([]);
  mocks.catalogs.mockResolvedValue([]);
  mocks.cart.mockResolvedValue(null);
});

it.each(["uk", "en"])("redirects missing tenant context before any database query in %s", async locale => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.locale.mockResolvedValue(locale);
  await expect(AssortmentPage()).rejects.toThrow("REDIRECT");
  expect(mocks.redirect).toHaveBeenCalledWith({ href: "/login", locale });
  for (const query of [mocks.brands, mocks.catalogs, mocks.cart]) expect(query).not.toHaveBeenCalled();
});

it("loads tenant-scoped data and serializes catalogue dates for the client", async () => {
  const brands = [{ id: "brand", name: "Demo" }];
  const uploadedAt = new Date("2026-11-16T08:00:00Z");
  mocks.brands.mockResolvedValue(brands);
  mocks.catalogs.mockResolvedValue([{ id: "catalog", uploadedAt }]);
  mocks.cart.mockResolvedValue({ items: [item, null, { ...item, qty: "2" }] });
  const element = await AssortmentPage();
  expect(element.type).toBe(PlannerApp);
  expect(element.props).toEqual({ initialBrands: brands, initialCatalogs: [{ id: "catalog", uploadedAt: uploadedAt.toISOString() }], initialCart: [item] });
  for (const query of [mocks.brands, mocks.catalogs, mocks.cart]) {
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "demo" } }));
  }
});

it.each([null, { items: null }, { items: {} }])("restores an empty cart from %j", async cart => {
  mocks.cart.mockResolvedValue(cart);
  expect((await AssortmentPage()).props.initialCart).toEqual([]);
});
