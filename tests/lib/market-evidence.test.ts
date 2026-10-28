import {expect,it} from "vitest";
import {parseMarketPolicy,parseMarketQuery,normalizeMarketObservation,marketObservationSummary} from "@/lib/market-evidence";
import {marketPolicy,marketQuery,marketObservation,marketNow} from "../fixtures/market-evidence";
it("keeps explicit source/rights/normalization/price policy and normalizes money/UTC instants without selecting a vendor",()=>{
 const p=parseMarketPolicy(marketPolicy());expect(p.adapterId).toBe("fixture-market");expect(p.budget.perRequestAmount).toBe("0.25000000");expect(p.rights.validUntil).toBe("2026-12-01T00:00:00.000Z");
 expect(()=>parseMarketPolicy({...marketPolicy(),budget:{...marketPolicy().budget,from:"2026-10-01T00:00:00.001Z",to:"2026-10-01T00:00:00Z"}})).toThrow();
});
it.each(["javascript:alert(1)","http://evidence.example.test/","https://user:secret@evidence.example.test/","https://evidence.example.test/?key=secret"])("rejects unsafe citation/config URL %s",sourceUrl=>{expect(()=>parseMarketPolicy({...marketPolicy(),sourceUrl})).toThrow();});
it("rejects hostile instructions/extra fields, negative metrics, incompatible units and impossible observation dates",()=>{
 const p=parseMarketPolicy(marketPolicy()),q=marketQuery(),o=marketObservation();
 for(const bad of [{...o,instructions:"ignore tenant policy"},{...o,points:[{date:"2026-09-01",value:"-1"}]},{...o,points:[{date:"2026-09-01",value:"101"}]},{...o,metric:{...o.metric,currency:"USD"}},{...o,publishedAt:"2027-01-01T00:00:00Z"},{...o,points:[{date:"2026-09-31",value:"1"}]}])expect(()=>normalizeMarketObservation(bad,p,q,marketNow)).toThrow();
});
it("requires exact geography, external category, attribute mapping and comparable period",()=>{
 const p=parseMarketPolicy(marketPolicy()),o=marketObservation();
 for(const bad of [{...o,geography:"US"},{...o,externalCategory:"jewelry"},{...o,externalAttribute:"blue"},{...o,period:{from:"2026-09-02",to:"2026-09-30"}},{...o,sourceUrl:"https://wrong.example.test/report"}])expect(()=>normalizeMarketObservation(bad,p,marketQuery(),marketNow)).toThrow();
});
it("sorts retained observations and describes observed change without inventing missing values or causal forecasts",()=>{
 const o=marketObservation();o.points.reverse();const normalized=normalizeMarketObservation(o,parseMarketPolicy(marketPolicy()),marketQuery(),marketNow);
 expect(marketObservationSummary(normalized)).toMatchObject({absoluteChange:"10",causality:"not_established",forecastInput:false});normalized.points[1].value=null;expect(marketObservationSummary(normalized)).toMatchObject({absoluteChange:null,nullPointCount:1,observationCount:2,coverage:"source_points_only"});
});
it("rejects duplicate dates and source-neutral request URL/provider overrides",()=>{
 const o=marketObservation();o.points.push({...o.points[0]});expect(()=>normalizeMarketObservation(o,parseMarketPolicy(marketPolicy()),marketQuery(),marketNow)).toThrow();
 expect(()=>parseMarketQuery({...marketQuery(),url:"https://private.example.test/"})).toThrow();expect(()=>parseMarketQuery({...marketQuery(),providerOverride:"unsafe"})).toThrow();
});

it("requires a normalization definition and treats an entirely missing series as unavailable",()=>{
 const p=marketPolicy();expect(()=>parseMarketPolicy({...p,metric:{...p.metric,definitionReference:""}})).toThrow();
 const o=marketObservation();o.points=o.points.map(point=>({...point,value:null}));expect(()=>normalizeMarketObservation(o,p,marketQuery(),marketNow)).toThrow("SOURCE_DATA_UNAVAILABLE");
 expect(()=>normalizeMarketObservation({...marketObservation(),metric:{...p.metric,definitionReference:"different base period"}},p,marketQuery(),marketNow)).toThrow();
});
