import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { databaseReportStorage } from "@/lib/workspace-report-storage";
import { createMerchandisingDb } from "../helpers/merchandising-db";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

it("restores the active report across independent readers and changes it only at the expected revision", async () => {
  const { pg, db } = await createMerchandisingDb();
  try {
    await pg.exec(`
      INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES
        ('training','Training','training',now()), ('other','Other','other',now());
    `);
    const tenantHash = createHash("sha256").update("training").digest("hex");
    const prefix = `merchandising/v1/${tenantHash}`;
    const active = `${prefix}/active.json`;
    const original = databaseReportStorage("training", db);
    const reader = databaseReportStorage("training", db);

    expect(await reader.read(active)).toBeNull();
    await original.write(`${prefix}/version/overview.json`, '{"amount":37551}');
    expect(await original.publish(active, "first", null)).toBe(true);
    const saved = await reader.read(active);
    expect(saved?.text).toBe("first");
    expect(await reader.read(`${prefix}/version/overview.json`)).toMatchObject({ text: '{"amount":37551}' });
    expect(await original.publish(active, "next", saved!.revision)).toBe(true);
    expect(await reader.publish(active, "stale", saved!.revision)).toBe(false);
    expect(await reader.read(active)).toMatchObject({ text: "next" });
    await expect(databaseReportStorage("other", db).read(active)).rejects.toThrow("namespace");
  } finally {
    await pg.close();
  }
}, 15_000);
