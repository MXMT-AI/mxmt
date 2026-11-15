import { beforeEach, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
const state = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ requireApiUser: state.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { catalogUpload: { findMany: state.findMany } } }));
import { GET } from "@/app/api/planner/catalogs/route";
beforeEach(() => vi.clearAllMocks());
it("returns the current tenant's catalogs in upload order with serialized dates", async () => {
  state.auth.mockResolvedValue({ user: { tenantId: "tenant-a" }, response: null });
  state.findMany.mockResolvedValue([{ id: "c", brandId: "b", season: "SS26", itemCount: 10, uploadedAt: new Date("2026-11-01T10:00:00Z"), brand: { name: "Demo" } }]);
  const response = await GET();
  expect(state.findMany).toHaveBeenCalledWith({ where: { tenantId: "tenant-a" }, select: { id: true, brandId: true, season: true, itemCount: true, uploadedAt: true, brand: { select: { name: true } } }, orderBy: { uploadedAt: "desc" } });
  expect((await response.json())[0]).toMatchObject({ itemCount: 10, uploadedAt: "2026-11-01T10:00:00.000Z" });
});
it("returns the authentication response without querying catalogs", async () => {
  const denied = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  state.auth.mockResolvedValue({ user: null, response: denied });
  expect(await GET()).toBe(denied);
  expect(state.findMany).not.toHaveBeenCalled();
});
