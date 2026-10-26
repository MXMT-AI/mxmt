import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { parseScenarioExport } from "@/lib/scenario-export-store";
const valid = {
  exportId: "11111111-1111-4111-8111-111111111111",
  kind: "reorder",
  previewId: "a".repeat(64),
  scenario: { snapshotId: "frozen" },
};
describe("export identity and request boundary", () => {
  it.each([
    { exportId: "../unsafe" },
    { kind: ["reorder"] },
    { kind: "other" },
    { previewId: "fake" },
    { actorId: "forged" },
    { tenantId: "b" },
    { files: [] },
    { rows: [] },
    { dataVersion: 1 },
    { scenario: { snapshotId: "frozen", formula: "fake" } },
    { target: { supplierId: "supplier", currency: "UAH", rows: [] } },
    { target: { supplierId: "supplier\nheader", currency: "UAH" } },
    { target: { supplierId: "supplier", currency: "usd" } },
  ])("rejects invalid/authoritative export fields %j", (patch) =>
    expect(() => parseScenarioExport({ ...valid, ...patch })).toThrow(),
  );
  it("normalizes display pagination before idempotency hashing and accepts explicit supplier scope", () => {
    expect(
      parseScenarioExport({
        ...valid,
        scenario: { snapshotId: "frozen", page: 2, pageSize: 100 },
        target: { supplierId: "supplier", currency: "UAH" },
      }),
    ).toMatchObject({
      scenario: { page: 1, pageSize: 25 },
      target: { supplierId: "supplier", currency: "UAH" },
    });
  });
});
