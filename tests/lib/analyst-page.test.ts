import { beforeEach, expect, it, vi } from "vitest";
import AnalystPage from "@/components/analyst/analyst-page/analyst-page";
import AnalystApp from "@/components/analyst/analyst-app/analyst-app";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), locale: vi.fn(), redirect: vi.fn(), classify: vi.fn(), tenant: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next-intl/server", () => ({ getLocale: mocks.locale }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findUnique: mocks.tenant } } }));
vi.mock("@/lib/analyst-classification", () => ({ loadAnalystClassification: mocks.classify }));

const classification = { skus: [], summary: { total: 0, hit: 0, stockout: 0, slow: 0, dead: 0, ok: 0 }, businessModel: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ "x-tenant-id": "demo" }));
  mocks.locale.mockResolvedValue("uk");
  mocks.redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
  mocks.classify.mockResolvedValue(classification);
  mocks.tenant.mockResolvedValue({ name: "Demo store" });
});

it.each(["uk", "en"])("redirects missing tenant context before loading data in %s", async locale => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.locale.mockResolvedValue(locale);
  await expect(AnalystPage()).rejects.toThrow("REDIRECT");
  expect(mocks.redirect).toHaveBeenCalledWith({ href: "/login", locale });
  expect(mocks.classify).not.toHaveBeenCalled();
  expect(mocks.tenant).not.toHaveBeenCalled();
});

it.each(["Demo store", null])("passes tenant-scoped classification and tenant name %s to the app", async name => {
  mocks.tenant.mockResolvedValue(name === null ? null : { name });
  const element = await AnalystPage();
  expect(mocks.classify).toHaveBeenCalledWith("demo");
  expect(mocks.tenant).toHaveBeenCalledWith({ where: { id: "demo" }, select: { name: true } });
  expect(element.type).toBe(AnalystApp);
  expect(element.props).toEqual({ initialSkus: classification.skus, initialSummary: classification.summary, businessModel: null, tenantName: name ?? "" });
  expect(mocks.redirect).not.toHaveBeenCalled();
});
