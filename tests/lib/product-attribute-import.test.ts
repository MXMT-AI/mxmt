import {beforeAll,afterAll,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
import {createScreenDb} from "../helpers/screen-db";
import {storeCatalog} from "@/lib/connectors/catalog-storage";
import {readSkuAttributeEvidence} from "@/lib/product-attribute-store";
import {compileCsv,parseCsvOptions} from "@/lib/connectors/csv/compile";
import {csvOptions,csvPacket,csvFile,csvProducts} from "../fixtures/csv-connector";
import type {CatalogSnapshot} from "@/lib/connectors/contract";
import {QUERIES} from "@/lib/connectors/shopify/queries";
let f:Awaited<ReturnType<typeof createScreenDb>>;
beforeAll(async()=>{f=await createScreenDb();},30000);afterAll(async()=>f?.pg.close());
it("retains immutable per-product attribute observations through canonical catalog storage for later as-of remapping",async()=>{
 const time="2026-10-24T10:00:00Z",raw={param:[{"@_name":"Колір циферблата","#text":"Синій"}]};
 const snapshot:CatalogSnapshot={observedAt:time,rawResponse:"synthetic original YML body",products:[{externalId:"sku-a",sku:"A",name:"Alpha",barcode:null,brand:null,categoryId:null,retailPrice:"20",costPrice:null,currency:"UAH",observedAt:time,updatedAt:null,raw}],stock:[{externalId:"sku-a",productId:"sku-a",onHand:"12",inTransit:null,observedAt:time,updatedAt:null}]};
 const scope={tenantId:"a",sourceId:"source",importRunId:"inventory-run",timezone:"Europe/Kyiv"};
 await f.db.$transaction(tx=>storeCatalog(tx,scope,snapshot));
 const a=await f.db.$transaction(tx=>readSkuAttributeEvidence({tenantId:"a",userId:"owner"},"source","sku-a","2026-10-25T00:00:00Z",tx));expect(a?.data).toEqual(raw);
 const later="2026-10-26T10:00:00Z";await f.db.$transaction(tx=>storeCatalog(tx,scope,{...snapshot,observedAt:later,products:snapshot.products.map(p=>({...p,observedAt:later,raw:{param:[{"@_name":"Колір циферблата","#text":"Червоний"}]}})),stock:snapshot.stock.map(s=>({...s,observedAt:later}))}));
 expect(await f.db.$transaction(tx=>readSkuAttributeEvidence({tenantId:"a",userId:"owner"},"source","sku-a","2026-10-25T00:00:00Z",tx))).toEqual(a);
 const b=await f.db.$transaction(tx=>readSkuAttributeEvidence({tenantId:"a",userId:"owner"},"source","sku-a","2026-10-27T00:00:00Z",tx));expect(b?.recordId).not.toBe(a?.recordId);expect(b?.data?.param).toEqual([{"@_name":"Колір циферблата","#text":"Червоний"}]);
 expect((await f.pg.query(`SELECT indexname FROM pg_indexes WHERE indexname='DataSourceRecord_attribute_product_observation_idx'`)).rows).toHaveLength(1);
});
it("accepts an optional structured CSV attribute column while preserving legacy packets",()=>{
 const files=csvPacket(),products=csvFile("products",csvProducts.map(p=>({...p,attributes:JSON.stringify({dial_color:["blue","red"]})})));
 const compiled=compileCsv(files.map(f=>f.resource==="products"?products:f),parseCsvOptions(csvOptions));expect(compiled.preview.errors).toEqual([]);expect(compiled.bundle.catalogs[0].products[0].raw?.attributes).toEqual({dial_color:["blue","red"]});
 expect(compileCsv(csvPacket(),parseCsvOptions(csvOptions)).preview.errors).toEqual([]);
});
it("requests explicit Shopify selected options without treating variant titles as attributes",()=>{expect(QUERIES.Variants).toContain("selectedOptions { name value }");});
