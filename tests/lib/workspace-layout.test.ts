import { isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import WorkspaceLayout from "@/components/workspace/workspace-layout/workspace-layout";
import Sidebar from "@/components/sidebar/sidebar";
import TokenRefreshProvider from "@/components/token-refresh-provider/token-refresh-provider";
import { mainContentId } from "@/components/ui/skip-link/skip-link";
const mocks = vi.hoisted(() => ({ headers: vi.fn(), findUnique: vi.fn(), locale: vi.fn(), redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next-intl/server", () => ({ getLocale: mocks.locale, getTranslations: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findUnique: mocks.findUnique } } }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ "x-tenant-id": "tenant", "x-user-role": "ADMIN" }));
  mocks.findUnique.mockResolvedValue({ name: "Demo cabinet" });
  mocks.locale.mockResolvedValue("uk");
  mocks.redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
});
it("redirects missing tenant context without querying the database", async () => {
  mocks.headers.mockResolvedValue(new Headers());
  await expect(WorkspaceLayout({ children: "Report" })).rejects.toThrow("REDIRECT");
  expect(mocks.findUnique).not.toHaveBeenCalled();
  expect(mocks.redirect).toHaveBeenCalledWith({ href: "/login", locale: "uk" });
});
it("redirects an unavailable tenant using the current locale", async () => {
  mocks.findUnique.mockResolvedValue(null);
  mocks.locale.mockResolvedValue("en");
  await expect(WorkspaceLayout({ children: "Report" })).rejects.toThrow("REDIRECT");
  expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: "tenant" }, select: { name: true } });
  expect(mocks.redirect).toHaveBeenCalledWith({ href: "/login", locale: "en" });
});
it.each(["ADMIN", null])("preserves cabinet identity, role %s, session refresh and the main-content target", async role => {
  mocks.headers.mockResolvedValue(new Headers(role ? { "x-tenant-id": "tenant", "x-user-role": role } : { "x-tenant-id": "tenant" }));
  const tree = nodes(await WorkspaceLayout({ children: "Report" }));
  expect(tree.find(node => node.type === Sidebar)!.props).toMatchObject({ tenantName: "Demo cabinet", userRole: role ?? "viewer" });
  expect(tree.some(node => node.type === TokenRefreshProvider)).toBe(true);
  expect(tree.find(node => node.type === "main")!.props).toMatchObject({ id: mainContentId, tabIndex: -1, children: "Report" });
  expect(mocks.redirect).not.toHaveBeenCalled();
});
