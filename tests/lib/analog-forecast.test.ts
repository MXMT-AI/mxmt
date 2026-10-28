import {expect,it} from "vitest";
import {ANALOG_EVALUATION_CASE_LIMIT,parseAnalogPolicy,estimateAnalogs,scoreAnalogCases,forecastPeriod} from "@/lib/analog-forecast";
import {analogPolicy,analogPacket,analogRow} from "../fixtures/analog-forecast";
it("requires explicit draft policy bounds instead of installing business defaults",()=>{
 expect(parseAnalogPolicy(analogPolicy())).toEqual(analogPolicy());
 for(const bad of [{...analogPolicy(),horizonDays:0},{...analogPolicy(),minInStockDays:27},{...analogPolicy(),maxAnalogs:0},{...analogPolicy(),historyDays:28},{...analogPolicy(),price:{mode:"elasticity",maxRelativeDifference:"1"}},{...analogPolicy(),evaluation:{...analogPolicy().evaluation,minCoverage:"1.1"}},{...analogPolicy(),activate:true}])expect(()=>parseAnalogPolicy(bad)).toThrow();
});
it("reproduces exact equal weights and saved-velocity estimates independently of input order",()=>{
 const p=analogPolicy(),packet=analogPacket(),a=estimateAnalogs(packet,p);packet.rows.reverse();expect(estimateAnalogs(packet,p)).toEqual(a);expect(a).toMatchObject({status:"estimated",forecastUnits:"10.5",analogs:[{skuId:"a",weight:{numerator:1,denominator:2}},{skuId:"b",weight:{numerator:1,denominator:2}}],uncertainty:{kind:"unevaluated",interval:null},procurementAction:false});
});
it("never uses the target's sales/velocity as a training outcome",()=>{
 const packet=analogPacket(),a=estimateAnalogs(packet,analogPolicy());packet.rows[0].velocityPerWeek="0";packet.rows[0].velocityState="RETURN_DOMINATED";expect(estimateAnalogs(packet,analogPolicy())).toEqual(a);
});
it.each([
 ["EXPOSURE_UNAVAILABLE",{inStockDays:27}], ["EXPOSURE_UNAVAILABLE",{velocityBasis:"RECEIPT_FALLBACK"}], ["EXPOSURE_UNAVAILABLE",{historyComplete:false}], ["EXPOSURE_UNAVAILABLE",{windowTo:"2026-10-26"}],
 ["NET_SALES_UNAVAILABLE",{velocityState:"RETURN_DOMINATED",velocityPerWeek:"-1"}], ["LAUNCH_COHORT_UNVERIFIED",{firstReceiptDate:"2026-09-01"}], ["PRICE_NOT_COMPARABLE",{price:"30"}], ["PRICE_NOT_COMPARABLE",{priceHistoryComplete:false}],
 ["SCOPE_MISMATCH",{currency:"USD"}], ["SEASON_NOT_COMPARABLE",{seasonMonths:[10]}], ["ATTRIBUTES_UNAVAILABLE",{attributes:{color:{state:"MULTI_VALUE",valueIds:["blue","red"]}}}], ["ATTRIBUTE_MISMATCH",{attributes:{color:{state:"KNOWN",valueIds:["red"]}}}],
])("excludes %s explicitly",(reason,patch)=>{
 const packet=analogPacket();packet.rows=[packet.rows[0],{...analogRow("a"),...patch}];const r=estimateAnalogs(packet,analogPolicy());expect(r).toMatchObject({status:"manual_review",forecastUnits:null,reason:"INSUFFICIENT_ANALOGS",exclusions:[{skuId:"a",reason}]});
});
it("retains observed zero sales as evidence while missing attributes/launch cannot become a confident zero",()=>{
 const packet=analogPacket();packet.rows[1].velocityPerWeek="0";packet.rows[2].velocityPerWeek="0";expect(estimateAnalogs(packet,analogPolicy())).toMatchObject({status:"estimated",forecastUnits:"0"});packet.rows[0].firstReceiptDate=null;expect(estimateAnalogs(packet,analogPolicy())).toMatchObject({status:"manual_review",forecastUnits:null});
});
it("records stable ID truncation and keeps category baseline separate from attribute selection",()=>{
 const p=analogPolicy();p.maxAnalogs=1;const packet=analogPacket();packet.rows.push({...analogRow("c"),velocityPerWeek:"30",attributes:{color:{state:"KNOWN",valueIds:["red"]}}});const r=estimateAnalogs(packet,p);expect(r.forecastUnits).toBe("7");expect(r.exclusions).toContainEqual({skuId:"b",reason:"ANALOG_LIMIT"});expect(r.baselines.category_mean).toBe("17");
});
it("rejects duplicate/truncated packets and period overrides",()=>{
 const p=analogPolicy(),packet=analogPacket();expect(()=>estimateAnalogs({...packet,from:"2026-10-25"},p)).toThrow();expect(()=>estimateAnalogs({...packet,rows:[...packet.rows,packet.rows[1]]},p)).toThrow();p.candidateLimit=2;expect(()=>estimateAnalogs(packet,p)).toThrow();expect(forecastPeriod("2026-12-30",3)).toEqual({from:"2026-12-31",to:"2027-01-02"});
});
it("reports paired MAE, signed bias, coverage and WAPE without percentage errors at zero demand",()=>{
 const p=analogPolicy(),cases=[{forecastId:"a",horizonDays:7,forecastUnits:"2",baselines:{zero:"0",category_mean:"3"},actualUnits:"0",exclusion:null},{forecastId:"b",horizonDays:7,forecastUnits:"6",baselines:{zero:"0",category_mean:"3"},actualUnits:"4",exclusion:null},{forecastId:"c",horizonDays:7,forecastUnits:"1",baselines:{zero:"0",category_mean:"3"},actualUnits:null,exclusion:"OUTCOME_STOCK_CENSORED_OR_MISSING"}];
 const r=scoreAnalogCases(cases,p);expect(r).toMatchObject({scored:2,metrics:{forecast:{mae:"2",bias:"2",wape:"1"},zero:{mae:"2",bias:"-2"}},meetsDraftThresholds:false,releaseApproved:false,calibratedIntervals:false});
 cases[1].actualUnits="0";expect(scoreAnalogCases(cases,p).metrics.forecast.wape).toBeNull();
});
it("never treats empty coverage or a passing draft score as release approval",()=>{
 const p=analogPolicy(),c={forecastId:"a",horizonDays:7,forecastUnits:"0",baselines:{zero:"0",category_mean:"0"},actualUnits:"0",exclusion:null};p.evaluation.minScoredCases=1;expect(scoreAnalogCases([c],p)).toMatchObject({meetsDraftThresholds:true,releaseApproved:false});expect(scoreAnalogCases([{...c,exclusion:"NO_DATA",actualUnits:null}],p)).toMatchObject({scored:0,metrics:{forecast:{mae:null}},meetsDraftThresholds:false});expect(()=>scoreAnalogCases([c,c],p)).toThrow();
});
it("preserves saved Decimal precision, including very small rates, without presentation rounding",()=>{
 const packet=analogPacket();packet.rows[1].velocityPerWeek="0.000000000000000000000000000001";packet.rows[2].velocityPerWeek="0.000000000000000000000000000001";const r=estimateAnalogs(packet,analogPolicy());expect(r.status).toBe("estimated");expect(r.forecastUnits).toBe("1e-30");expect(scoreAnalogCases([{forecastId:"tiny",horizonDays:7,forecastUnits:r.forecastUnits,baselines:r.baselines,actualUnits:"0",exclusion:null}],analogPolicy()).scored).toBe(1);
});

it("aligns reachable policy thresholds with the API and scorer case limit",()=>{
 const p=analogPolicy();p.evaluation.minScoredCases=ANALOG_EVALUATION_CASE_LIMIT;
 expect(parseAnalogPolicy(p).evaluation.minScoredCases).toBe(20);
 expect(()=>parseAnalogPolicy({...p,evaluation:{...p.evaluation,minScoredCases:ANALOG_EVALUATION_CASE_LIMIT+1}})).toThrow("INVALID_ANALOG_POLICY");
 const cases=Array.from({length:ANALOG_EVALUATION_CASE_LIMIT},(_,i)=>({forecastId:`case-${i}`,horizonDays:p.horizonDays,forecastUnits:"0",baselines:{zero:"0",category_mean:"0"},actualUnits:"0",exclusion:null}));
 expect(scoreAnalogCases(cases,p)).toMatchObject({scored:20,meetsDraftThresholds:true,releaseApproved:false});
 expect(()=>scoreAnalogCases([...cases,{...cases[0],forecastId:"overflow"}],p)).toThrow("INVALID_FORECAST_EVALUATION");
});
