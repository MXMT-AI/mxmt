import {expect,it} from "vitest";
import {parseExecutionCommand,retrospectiveWindows,observedGmroi} from "@/lib/retrospective-contract";
const command=()=>({requestKey:"11111111-1111-4111-8111-111111111111",exportId:"22222222-2222-4222-8222-222222222222",kind:"reprice",event:"APPLIED",occurredAt:"2026-10-25T09:00:00Z",evidenceReference:"Owner checked applied price report",skuIds:["b","a"],previousExecutionId:null,receiptIds:[]});
it("canonicalizes confirmations without permitting caller-authored prices, actuals or duplicate SKU evidence",()=>{
 expect(parseExecutionCommand(command()).skuIds).toEqual(["a","b"]);
 for(const bad of [{...command(),newPrice:1},{...command(),skuIds:["a","a"]},{...command(),occurredAt:"2026-02-30T00:00:00Z"},{...command(),evidenceReference:"<script>"},{...command(),skuIds:[]},{...command(),kind:"reorder",event:"RECEIVED"},{...command(),kind:"reprice",event:"SENT"}])expect(()=>parseExecutionCommand(bad)).toThrow();
});
it("derives equal full calendar periods around launch, excluding the launch day across DST/year boundaries",()=>{
 expect(retrospectiveWindows("2026-10-25T09:00:00Z","Europe/Kyiv",3)).toMatchObject({launchDate:"2026-10-25",before:{from:"2026-10-22",to:"2026-10-24"},after:{from:"2026-10-26",to:"2026-10-28"}});
 expect(retrospectiveWindows("2026-12-31T23:00:00Z","Europe/Kyiv",1)).toMatchObject({launchDate:"2027-01-01",before:{from:"2026-12-31",to:"2026-12-31"},after:{from:"2027-01-02",to:"2027-01-02"}});
 expect(()=>retrospectiveWindows(command().occurredAt,"UTC",91)).toThrow();
});
it("reproduces approved daily-observation GMROI examples without annualization",()=>{
 const days=[{date:"2026-10-01",stockCost:"100",complete:true},{date:"2026-10-02",stockCost:"300",complete:true}];expect(observedGmroi("150",true,"2026-10-01","2026-10-02",days)).toMatchObject({value:"0.75",averageObservedInventoryCost:"200",annualized:false,basis:"DAILY_OBSERVATION_APPROXIMATION"});expect(observedGmroi("-50",true,"2026-10-01","2026-10-02",days).value).toBe("-0.25");expect(observedGmroi("0",true,"2026-10-01","2026-10-02",days).value).toBe("0");
});
it("never turns missing evidence, zero denominator or duplicate observation dates into zero GMROI",()=>{
 const day={date:"2026-10-01",stockCost:"0",complete:true};expect(observedGmroi("1",true,day.date,day.date,[day])).toMatchObject({value:null,reason:"ZERO_INVENTORY_DENOMINATOR"});for(const days of [[],[{...day,stockCost:null}],[{...day,complete:false}],[{...day,stockCost:"-1"}]])expect(observedGmroi("1",true,day.date,day.date,days).value).toBeNull();expect(observedGmroi(null,false,day.date,day.date,[day]).reason).toBe("SALES_OR_PROFIT_INCOMPLETE");expect(observedGmroi("1",true,day.date,"2026-10-02",[day,day]).reason).toBe("INVENTORY_INCOMPLETE");
});
