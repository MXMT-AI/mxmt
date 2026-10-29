import {beforeAll,afterAll,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
import {buildStockHistory,stockHistoryDates,type StockHistoryObservation} from "@/lib/stock-history";
import {readStockHistory} from "@/lib/stock-history-store";
import {createScreenDb,screenSelection} from "../helpers/screen-db";
import {createScreenSnapshot,type ScreenSnapshot} from "@/lib/merchandising-snapshot";
import {parseScreenQuery} from "@/lib/merchandising-screen-query";
import StockHistory from "@/components/stock/StockHistory";
const asOf="2026-10-25",dates=stockHistoryDates(asOf);
const rows=():StockHistoryObservation[]=>dates.dates.map(date=>({date,currency:"UAH",cohortSize:2,observedCount:2,quantity:"3",coveredCost:"0",costCount:2,firstObservedAt:`${date}T03:00:00Z`,lastObservedAt:`${date}T03:00:00Z`}));
it("uses completed month ends and true leap-year month ends",()=>{
 expect(dates.current.at(-1)).toBe("2026-09-30");expect(dates.current).not.toContain("2026-10-31");const leap=stockHistoryDates("2025-03-01");expect(leap.current.at(-1)).toBe("2025-02-28");expect(leap.prior.at(-1)).toBe("2024-02-29");expect(dates.readiness).toHaveLength(30);
});
it("requires 30 consecutive complete observation days and never interprets a missing day as zero stock",()=>{
 const r=rows();r.find(r=>r.date===dates.readiness[0])!.observedCount=1;expect(buildStockHistory(asOf,r).byCurrency[0]).toMatchObject({state:"INSUFFICIENT_HISTORY",completeDays:29,points:[]});expect(buildStockHistory(asOf,[]).byCurrency).toEqual([]);
});
it("preserves real zero, unknown cost and missing LY independently without carry forward",()=>{
 const r=rows(),sep=r.find(r=>r.date==="2026-09-30")!;sep.costCount=1;sep.coveredCost="2.5";r.find(r=>r.date==="2025-09-30")!.observedCount=0;
 const b=buildStockHistory(asOf,r).byCurrency[0];expect(b.state).toBe("READY");expect(b.points.at(-1)).toMatchObject({current:{quantity:"3",stockCost:null,coveredStockCost:"2.5"},priorYear:{quantity:null,stockCost:null}});expect(b.points[0].current.stockCost).toBe("0");
});
it.each(["uk","en"] as const)("renders a responsive chart with exact-value table and provenance (%s)",lang=>{
 const html=renderToStaticMarkup(createElement(StockHistory,{history:buildStockHistory(asOf,rows()),currency:"UAH",lang}));expect(html).toContain('role="img"');expect(html).toContain("<table");expect(html).toContain("<summary");expect(html).toContain('scope="col"');expect(html).not.toMatch(/NaN|Infinity|<polyline/);
 const empty=renderToStaticMarkup(createElement(StockHistory,{history:buildStockHistory(asOf,[]),currency:"UAH",lang}));expect(empty).not.toContain("<svg");expect(empty).toContain("30");
});
let f:Awaited<ReturnType<typeof createScreenDb>>,snapshot:ScreenSnapshot;
beforeAll(async()=>{f=await createScreenDb();snapshot=await createScreenSnapshot("a",screenSelection,f.db);},30000);afterAll(async()=>f?.pg.close());
const query=(extra:Record<string,string>={})=>parseScreenQuery(new URLSearchParams({snapshotId:snapshot.snapshotId,...extra}),"stock");
it("reads tenant/source-scoped observed month-end facts, ignores sales channel and never invents LY",async()=>{
 const a=await readStockHistory("a",snapshot,query({skuId:"sku-a"}),f.db),b=await readStockHistory("a",snapshot,query({skuId:"sku-a",channelId:"2"}),f.db);expect(a).toEqual(b);expect(a.byCurrency[0]).toMatchObject({state:"READY",completeDays:30});expect(a.byCurrency[0].points.at(-1)).toMatchObject({current:{date:"2026-09-30",quantity:"12",stockCost:"120"},priorYear:{quantity:null,stockCost:null}});
 expect((await readStockHistory("b",snapshot,query(),f.db)).byCurrency).toEqual([]);
});
it("requires the actual observation date and import provenance; adjacent/current stock cannot fill missing history",async()=>{
 try{
  await f.pg.exec(`UPDATE "InventorySnapshot" SET "observedAt"='2026-10-01T03:00:00Z' WHERE "skuId"='sku-a' AND "snapshotDate"='2026-09-30'`);expect((await readStockHistory("a",snapshot,query({skuId:"sku-a"}),f.db)).byCurrency[0]).toMatchObject({state:"INSUFFICIENT_HISTORY",completeDays:29,points:[]});
 }finally{await f.pg.exec(`UPDATE "InventorySnapshot" SET "observedAt"='2026-09-30T00:00:00Z' WHERE "skuId"='sku-a' AND "snapshotDate"='2026-09-30'`);}
});
it("keeps currencies separate and excludes unknown or negative quantities instead of summing partial stock",async()=>{
 const a=await readStockHistory("a",snapshot,query(),f.db);expect(new Set(a.byCurrency.map(b=>b.currency))).toEqual(new Set(["UAH","USD"]));
 try{await f.pg.exec(`UPDATE "InventorySnapshot" SET quantity=-1 WHERE "skuId"='sku-a' AND "snapshotDate"='2026-09-28'`);expect((await readStockHistory("a",snapshot,query({skuId:"sku-a"}),f.db)).byCurrency[0].state).toBe("INSUFFICIENT_HISTORY");}finally{await f.pg.exec(`UPDATE "InventorySnapshot" SET quantity=12 WHERE "skuId"='sku-a' AND "snapshotDate"='2026-09-28'`);}
});

it("keeps unknown currency valuation unavailable even with observed quantities",()=>{
 const r=rows().map(row=>({...row,currency:null}));const point=buildStockHistory(asOf,r).byCurrency[0].points.at(-1)!.current;expect(point.quantity).toBe("3");expect(point.stockCost).toBeNull();expect(point.coveredStockCost).toBeNull();
});
it("bounds the cohort before historical reads without breaking other stock sections",async()=>{
 const queryRaw=vi.fn().mockResolvedValue(Array.from({length:5001},(_,i)=>({skuId:`sku-${i}`,currency:"UAH"})));
 const h=await readStockHistory("a",snapshot,query(),{$queryRaw:queryRaw,$executeRaw:async()=>0});expect(h).toMatchObject({unavailableReason:"COHORT_LIMIT",byCurrency:[]});expect(queryRaw).toHaveBeenCalledTimes(1);
});
