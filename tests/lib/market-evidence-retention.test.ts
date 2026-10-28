import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const m=vi.hoisted(()=>({purge:vi.fn(),configured:vi.fn(),decision:vi.fn(),run:vi.fn()}));
vi.mock("@/lib/gdrive",()=>({isDriveConfigured:m.configured}));
vi.mock("@/lib/market-source-store",()=>({purgeExpiredMarketEvidence:m.purge}));
vi.mock("@/lib/data-scheduler",async importOriginal=>({...await importOriginal<typeof import("@/lib/data-scheduler")>(),scheduledImportDecision:m.decision,runScheduledDataPipelines:m.run}));
import {handleScheduledDataImport} from "@/lib/data-scheduler-route";
const request=(secret="fixture-cron")=>new NextRequest("https://app.test/api/cron/data-import",{headers:{authorization:`Bearer ${secret}`}});
beforeEach(()=>{vi.stubEnv("CRON_SECRET","fixture-cron");vi.clearAllMocks();m.purge.mockResolvedValue(0);m.configured.mockReturnValue(true);m.decision.mockReturnValue({shouldRun:false,businessDate:"2026-10-28"});m.run.mockResolvedValue([]);});afterEach(()=>vi.unstubAllEnvs());
it("never purges without authenticated cron credentials",async()=>{
 expect((await handleScheduledDataImport(request("wrong"))).status).toBe(401);vi.stubEnv("CRON_SECRET","");expect((await handleScheduledDataImport(request())).status).toBe(503);expect(m.purge).not.toHaveBeenCalled();
});
it("purges before skipping an off-window import or checking Google Sheets access",async()=>{
 expect((await handleScheduledDataImport(request())).status).toBe(200);expect(m.purge).toHaveBeenCalledTimes(1);expect(m.run).not.toHaveBeenCalled();
 m.configured.mockReturnValue(false);expect((await handleScheduledDataImport(request())).status).toBe(503);expect(m.purge).toHaveBeenCalledTimes(2);
});
it("reports retention failures without returning private database details",async()=>{
 m.purge.mockRejectedValue(Error("private DB failure"));const response=await handleScheduledDataImport(request());expect(response.status).toBe(500);expect(await response.text()).not.toContain("private DB");expect(m.run).not.toHaveBeenCalled();
});
