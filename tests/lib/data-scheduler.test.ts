import { DataImportTrigger, DataRunStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  cronSecretMatches,
  runScheduledDataPipelines,
  scheduledImportDecision,
} from "@/lib/data-scheduler";

describe("data scheduler", () => {
  it("runs at 07:00 Kyiv in winter", () => {
    const decision = scheduledImportDecision(new Date("2026-01-15T05:00:00.000Z"));
    expect(decision).toMatchObject({
      shouldRun: true,
      businessDate: "2026-01-15",
      localTime: "2026-01-15T07:00",
    });
  });

  it("runs at 07:00 Kyiv in summer without changing cron configuration", () => {
    const decision = scheduledImportDecision(new Date("2026-07-15T04:00:00.000Z"));
    expect(decision).toMatchObject({
      shouldRun: true,
      businessDate: "2026-07-15",
      localTime: "2026-07-15T07:00",
    });
    expect(scheduledImportDecision(new Date("2026-07-15T05:00:00.000Z")).shouldRun).toBe(false);
  });

  it("requires an exact Bearer cron secret", () => {
    expect(cronSecretMatches("Bearer secret-value", "secret-value")).toBe(true);
    expect(cronSecretMatches("Bearer wrong-value", "secret-value")).toBe(false);
    expect(cronSecretMatches(null, "secret-value")).toBe(false);
    expect(cronSecretMatches("Bearer secret-value", undefined)).toBe(false);
  });

  it("runs every configured tenant and isolates tenant failures", async () => {
    const db = {
      dataSource: {
        findMany: vi.fn().mockResolvedValue([{ tenantId: "tenant-a" }, { tenantId: "tenant-b" }]),
      },
    };
    const pipeline = vi.fn()
      .mockResolvedValueOnce({
        import: {
          outcome: "unchanged",
          importRunId: "import-a",
          status: DataRunStatus.SUCCESS,
        },
        calculation: {
          outcome: "calculated",
          calculationRunId: "calc-a",
          status: DataRunStatus.SUCCESS,
        },
      })
      .mockRejectedValueOnce(new Error("source unavailable"));

    const results = await runScheduledDataPipelines(
      "2026-08-27",
      db as never,
      pipeline as never
    );

    expect(db.dataSource.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { kind: "GOOGLE_SHEETS" },
    }));
    expect(pipeline).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      trigger: DataImportTrigger.CRON,
      calculate: true,
      asOfDate: "2026-08-27",
    });
    expect(results).toEqual([
      expect.objectContaining({ tenantId: "tenant-a", ok: true, importRunId: "import-a" }),
      { tenantId: "tenant-b", ok: false, error: "source unavailable" },
    ]);
  });
});

describe('SalesDrive schedule (Sheets remains at 07:00)',()=>{
 it('keeps winter/summer Kyiv stock on the current date and uses two-hour order slots',async()=>{
  const {salesDriveScheduleDecision}=await import('@/lib/data-scheduler');
  expect(salesDriveScheduleDecision(new Date('2026-01-15T01:00:00Z'))).toMatchObject({stockDue:true,businessDate:'2026-01-15'});
  expect(salesDriveScheduleDecision(new Date('2026-07-15T00:00:00Z'))).toMatchObject({stockDue:true,businessDate:'2026-07-15'});
  expect(salesDriveScheduleDecision(new Date('2026-07-14T23:59:00Z')).stockDue).toBe(false);
 });
 it('catches a missing spring hour and deduplicates a repeated autumn hour by date',async()=>{
  const {salesDriveScheduleDecision}=await import('@/lib/data-scheduler');
  expect(salesDriveScheduleDecision(new Date('2026-03-29T01:00:00Z'))).toMatchObject({stockDue:true,businessDate:'2026-03-29'});
  expect(salesDriveScheduleDecision(new Date('2026-10-25T00:00:00Z'))).toMatchObject({stockDue:true,businessDate:'2026-10-25'});
  expect(salesDriveScheduleDecision(new Date('2026-10-25T01:00:00Z'))).toMatchObject({stockDue:true,businessDate:'2026-10-25'});
 });
});
