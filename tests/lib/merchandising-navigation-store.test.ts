import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb } from "../helpers/screen-db";
import { readNavigationOptions } from "@/lib/merchandising-navigation-store";
import {
  readClientSettings,
  saveMerchandisingSettings,
} from "@/lib/merchandising-settings-store";
let fixture: Awaited<ReturnType<typeof createScreenDb>>;
beforeAll(async () => {
  fixture = await createScreenDb();
}, 30000);
afterAll(async () => fixture?.pg.close());
describe("tenant navigation choices", () => {
  it("reads channel identities only from the signed tenant connection", async () => {
    expect(await readNavigationOptions("a", fixture.db)).toEqual({
      monobrand: false,
      channels: [{ id: "1" }, { id: "2" }, { id: "__unassigned__" }],
      truncated: false,
    });
    expect(await readNavigationOptions("b", fixture.db)).toEqual({
      monobrand: false,
      channels: [],
      truncated: false,
    });
  });
  it("uses activated settings to hide brands and excluded channels without calculating reports", async () => {
    const client = await readClientSettings("a", fixture.db);
    await saveMerchandisingSettings(
      "a",
      "owner",
      "client",
      null,
      client.revision,
      {
        ...client.values,
        profileMode: "MONOBRAND",
        monoBrandId: "brand-a",
        excludedChannels: ["2"],
      },
      fixture.db,
    );
    expect(await readNavigationOptions("a", fixture.db)).toMatchObject({
      monobrand: true,
      channels: [{ id: "1" }, { id: "__unassigned__" }],
    });
    const result = await fixture.pg.query<{ n: number }>(
      `SELECT count(*)::int n FROM "ReportCalculationRun"`,
    );
    expect(result.rows[0].n).toBe(0);
  });
});
