import {expect,it} from "vitest";
import {salesDrivePriceBody,SALESDRIVE_PRICE_CONTRACT} from "@/lib/salesdrive-price-contract";
it("pins the official update field without registering a write transport or claiming undocumented atomic semantics",()=>{
 expect(SALESDRIVE_PRICE_CONTRACT).toMatchObject({path:"/product-handler/",priceField:"costPerItem",documentedBatchLimit:100,existingOnlyUpdateDocumented:false,atomicCompareAndSetDocumented:false,productionAdapterRegistered:false});
 const body=salesDrivePriceBody("source-product-123","00123.40","UAH"),parsed=JSON.parse(body);expect(parsed).toMatchObject({action:"update",product:[{id:"source-product-123",costPerItem:123.4,currency:"UAH"}]});expect(body).toContain('"costPerItem":123.40');expect(parsed.dontUpdateFields).not.toContain("price");expect(parsed.dontUpdateFields).toContain("discount");expect(parsed.product[0]).not.toHaveProperty("name");expect(parsed.product[0]).not.toHaveProperty("stockBalance");
});
it.each(["0","00.00","-1","1.001","1e3","NaN","1,20","1}\"action\":\"delete\""])("rejects nonpositive/unsupported numeric tokens %s",price=>{expect(()=>salesDrivePriceBody("123",price,"UAH")).toThrow();});
it("emits decimals without numeric conversion and rejects host/field/currency overrides",()=>{
 expect(salesDrivePriceBody("99999999999999999999","999999999999.99","UAH")).toContain('"costPerItem":999999999999.99');expect(()=>salesDrivePriceBody("https://private/","1","UAH")).toThrow();expect(()=>salesDrivePriceBody("123","1","USD")).toThrow();
});
