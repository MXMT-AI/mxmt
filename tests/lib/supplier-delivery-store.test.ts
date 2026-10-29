import {beforeAll,afterAll,beforeEach,it,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
vi.mock("server-only",()=>({}));vi.mock("@/lib/prisma",()=>({prisma:{}}));
import {createStockWorkspaceDb} from "../helpers/stock-workspace-db";
import {screenSelection} from "../helpers/screen-db";
import {createScreenSnapshot} from "@/lib/merchandising-snapshot";
import {getReorderingPreview} from "@/lib/reordering-store";
import {createScenarioExport,readScenarioExportFile} from "@/lib/scenario-export-store";
import {saveSupplierRecipient,approveSupplierRecipient} from "@/lib/supplier-recipient-store";
import {previewSupplierDelivery,approveSupplierDelivery,sendSupplierDelivery,reconcileSupplierDelivery,readSupplierDelivery,previewSupplierCancellation,approveSupplierCancellation,cancelSupplierDelivery,recordSupplierGoodsReceipt} from "@/lib/supplier-delivery-store";
import {confirmScenarioExecution} from "@/lib/retrospective-execution-store";
import type {SupplierDeliveryTransport,DeliveryAccessPolicy,DeliveryOutcome} from "@/lib/supplier-delivery";
let f:Awaited<ReturnType<typeof createStockWorkspaceDb>>,exportId:string,fileId:string,secondFileId:string,time:Date;
const p={tenantId:"a",userId:"owner"},attempts=new Map<string,DeliveryOutcome>();
const sendImpl:SupplierDeliveryTransport["send"]=async input=>{
 const prior=attempts.get(input.attemptId);if(prior)return prior;
 const outcome:DeliveryOutcome={state:time.getTime()>=Date.parse(input.approvedUntil)?"NOT_SENT":"SENT",deliveryId:"fake-delivery",destinationId:input.destinationId,payloadHash:input.payloadHash};attempts.set(input.attemptId,outcome);return outcome;
};
const send=vi.fn(sendImpl),lookup=vi.fn<SupplierDeliveryTransport["lookup"]>(async input=>attempts.get(input.attemptId)??{state:"UNKNOWN"}),cancel=vi.fn<SupplierDeliveryTransport["cancel"]>(async input=>{
 const outcome:DeliveryOutcome={state:"CANCELLED",deliveryId:input.deliveryId,destinationId:input.destinationId,payloadHash:input.payloadHash};attempts.set(input.attemptId,outcome);return outcome;
});
const transport:SupplierDeliveryTransport={capabilities:{idempotentDispatch:true,terminalAttemptLookup:true,fencesCancelledAttempts:true,confirmedCancellation:true},send,lookup,cancel};
const access=():DeliveryAccessPolicy=>({version:"synthetic",sourceId:"source",connectionRevision:1,channelId:"fake",accountId:"fake-account",approvalReference:"Synthetic owner quota approval",canaryReference:"Fake transport only",quotaKey:"fake-account",from:"2026-10-01T00:00:00Z",to:"2026-11-01T00:00:00Z",maxSends:100,maxLookups:100,maxCancellations:100});
const options=()=>({db:f.db,transport,access:access(),now:()=>time});
const recipient=()=>({version:1,supplierId:"supplier",channelId:"fake",destinationId:"verified-destination",label:"Synthetic recipient",currencies:["UAH"],verificationReference:"Synthetic verification",consentReference:"Synthetic consent",validUntil:"2026-11-01T00:00:00Z"});
const preview=()=>previewSupplierDelivery(p,{exportId,fileId,recipientId:"recipient"},options());
async function approved(){const op=await preview();return approveSupplierDelivery(p,{operationId:op.id,previewHash:op.previewHash,reference:"Explicit synthetic approval"},options());}
const dispatch=(op:{id:string;previewHash:string})=>sendSupplierDelivery(p,{operationId:op.id,previewHash:op.previewHash},options());
beforeAll(async()=>{
 f=await createStockWorkspaceDb();
 await f.pg.exec(`UPDATE "Brand" SET "supplierId"='supplier' WHERE id='brand-active';UPDATE "InventorySnapshot" SET "qtyInTransit"=0,"inTransitVerifiedAt"='2026-10-25T05:00:00Z';INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('analyst110','analyst110@test.invalid','test','Analyst','ANALYST','a',now()),('other110','other110@test.invalid','test','Other','ADMIN','a',now()),('foreign110','foreign110@test.invalid','test','Foreign','ADMIN','b',now());`);
 await f.pg.exec(`INSERT INTO "Supplier" (id,"tenantId",key,name,"leadTimeDays","coverDays",moq,"termsVerifiedAt","updatedAt") SELECT 'supplier-two',"tenantId",'supplier-two','Second supplier',"leadTimeDays","coverDays",moq,"termsVerifiedAt","updatedAt" FROM "Supplier" WHERE id='supplier';UPDATE "Sku" SET "supplierId"='supplier-two' WHERE id='sku-oos';`);
 const snapshot=await createScreenSnapshot("a",screenSelection,f.db),scenario={snapshotId:snapshot.snapshotId,mode:"brand",filters:{brandId:"brand-active"}},diff=await getReorderingPreview("a",scenario,f.db);exportId=randomUUID();
 const receipt=await createScenarioExport("a","owner",{exportId,kind:"reorder",previewId:diff.previewId,scenario},f.db,screenSelection.now);fileId=receipt.files.find(file=>file.supplierId==="supplier")!.id;secondFileId=receipt.files.find(file=>file.supplierId==="supplier-two")!.id;
},30000);
afterAll(async()=>f?.pg.close());
beforeEach(async()=>{
 time=new Date(screenSelection.now);attempts.clear();send.mockReset().mockImplementation(sendImpl);lookup.mockClear();cancel.mockClear();
 await f.pg.exec(`DELETE FROM "MerchandisingAction" WHERE "entityType" IN ('SUPPLIER_DELIVERY','SUPPLIER_DELIVERY_ATTEMPT','SUPPLIER_RECIPIENT','SCENARIO_EXECUTION');DELETE FROM "MerchandisingConfig" WHERE key LIKE 'supplier-recipient:%';DELETE FROM "ConnectorSelection";UPDATE "ConnectorConnection" SET revision=1 WHERE "tenantId"='a';`);
 const draft=await saveSupplierRecipient(p,"recipient",{expectedRevision:0,recipient:recipient()},f.db);await approveSupplierRecipient(p,"recipient",{configId:draft.configId,reference:"Synthetic recipient approval"},f.db,time);
});
it("disables production and rejects caller destinations, channels, messages, non-admins and foreign exports",async()=>{
 await expect(previewSupplierDelivery(p,{exportId,fileId,recipientId:"recipient"},{db:f.db})).rejects.toMatchObject({code:"SUPPLIER_DELIVERY_DISABLED"});
 await expect(previewSupplierDelivery(p,{exportId,fileId,recipientId:"recipient",destinationId:"forged"},options())).rejects.toMatchObject({code:"INVALID_SUPPLIER_DELIVERY_PREVIEW"});
 await expect(previewSupplierDelivery({tenantId:"a",userId:"analyst110"},{exportId,fileId,recipientId:"recipient"},options())).rejects.toMatchObject({code:"AI_FORBIDDEN"});
 await expect(previewSupplierDelivery({tenantId:"b",userId:"foreign110"},{exportId,fileId,recipientId:"recipient"},options())).rejects.toMatchObject({code:"SUPPLIER_EXPORT_GROUP_NOT_FOUND"});expect(send).not.toHaveBeenCalled();
});
it("pins exact audited bytes, quantities and totals; preview and approval never send, retries never resend",async()=>{
 const op=await approved();expect(send).not.toHaveBeenCalled();expect(op.state).toBe("APPROVED");expect(op.rows).toHaveLength(op.file.rowCount);
 const file=await readScenarioExportFile("a",exportId,fileId,f.db),sent=await dispatch(op);expect(sent.state).toBe("SENT");expect(send.mock.calls[0][0]).toMatchObject({destinationId:"verified-destination",payloadHash:op.payloadHash,attachment:{content:file.content,sha256:file.sha256}});
 expect(await dispatch(op)).toEqual(sent);expect(send).toHaveBeenCalledTimes(1);expect(cancel).not.toHaveBeenCalled();
});
it("keeps approvals actor-owned and rejects forged hashes and changed approval references",async()=>{
 const op=await approved();await expect(approveSupplierDelivery(p,{operationId:op.id,previewHash:op.previewHash,reference:"changed"},options())).rejects.toMatchObject({code:"SUPPLIER_APPROVAL_CONFLICT"});
 await expect(sendSupplierDelivery(p,{operationId:op.id,previewHash:"forged"},options())).rejects.toMatchObject({code:"SUPPLIER_PREVIEW_CHANGED"});
 await expect(readSupplierDelivery({tenantId:"a",userId:"other110"},op.id,f.db)).rejects.toMatchObject({code:"SUPPLIER_DELIVERY_NOT_FOUND"});expect(send).not.toHaveBeenCalled();
});
it("expires approval after fifteen minutes",async()=>{
 const op=await approved();time=new Date(time.getTime()+15*60000);await expect(dispatch(op)).rejects.toMatchObject({code:"SUPPLIER_APPROVAL_EXPIRED"});expect(send).not.toHaveBeenCalled();
});
it("invalidates an approved action as soon as a new recipient draft exists",async()=>{
 const op=await approved();await saveSupplierRecipient(p,"recipient",{expectedRevision:1,recipient:{...recipient(),destinationId:"replacement"}},f.db);
 await expect(dispatch(op)).rejects.toMatchObject({code:"SUPPLIER_RECIPIENT_NOT_APPROVED_FOR_GROUP"});expect(send).not.toHaveBeenCalled();
});
it("blocks changed verified supplier terms and connection credentials before sending",async()=>{
 const op=await approved();await f.pg.exec(`UPDATE "Supplier" SET moq=2 WHERE id='supplier'`);
 try{await expect(dispatch(op)).rejects.toMatchObject({code:"SUPPLIER_TERMS_CHANGED"});}finally{await f.pg.exec(`UPDATE "Supplier" SET moq=1 WHERE id='supplier'`);}
 await f.pg.exec(`UPDATE "ConnectorConnection" SET revision=2 WHERE "tenantId"='a'`);await expect(dispatch(op)).rejects.toMatchObject({code:"SUPPLIER_SOURCE_CHANGED"});expect(send).not.toHaveBeenCalled();
});
it("does not allow catalog reapproval to make a stale exported supplier policy current",async()=>{
 await f.pg.exec(`UPDATE "Supplier" SET moq=2 WHERE id='supplier'`);
 try{const draft=await saveSupplierRecipient(p,"recipient",{expectedRevision:1,recipient:recipient()},f.db);await approveSupplierRecipient(p,"recipient",{configId:draft.configId,reference:"New terms"},f.db,time);await expect(preview()).rejects.toMatchObject({code:"SUPPLIER_EXPORT_TERMS_STALE"});}
 finally{await f.pg.exec(`UPDATE "Supplier" SET moq=1 WHERE id='supplier'`);}expect(send).not.toHaveBeenCalled();
});
it("durably claims the group before sending and blocks concurrent competing operations",async()=>{
 const a=await approved(),b=await approved();let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 send.mockImplementationOnce(async input=>{entered();await gate;return sendImpl(input);});const pending=dispatch(a);await ready;
 expect((await dispatch(a)).state).toBe("DISPATCHING");await expect(dispatch(b)).rejects.toMatchObject({code:"SUPPLIER_GROUP_ALREADY_DISPATCHED_OR_UNKNOWN"});release();expect((await pending).state).toBe("SENT");expect(send).toHaveBeenCalledTimes(1);
});
it("retains timeout after remote delivery as unknown until explicit lookup, never resending",async()=>{
 const op=await approved();send.mockImplementationOnce(async input=>{await sendImpl(input);return new Promise(()=>{});});
 expect(await sendSupplierDelivery(p,{operationId:op.id,previewHash:op.previewHash},{...options(),timeoutMs:1})).toMatchObject({state:"DELIVERY_UNKNOWN"});
 await expect(reconcileSupplierDelivery(p,{operationId:op.id},options())).rejects.toMatchObject({code:"SUPPLIER_DELIVERY_STILL_IN_FLIGHT"});
 time=new Date(time.getTime()+31000);expect((await reconcileSupplierDelivery(p,{operationId:op.id},options())).state).toBe("SENT");expect((await dispatch(op)).state).toBe("SENT");expect(send).toHaveBeenCalledTimes(1);
});
it("requires destination and payload evidence; generic success cannot prove delivery",async()=>{
 const op=await approved();send.mockImplementationOnce(async()=>({state:"SENT",deliveryId:"fake",destinationId:"wrong",payloadHash:op.payloadHash}));
 expect((await dispatch(op)).state).toBe("DELIVERY_UNKNOWN");await expect(preview()).rejects.toMatchObject({code:"SUPPLIER_GROUP_ALREADY_DISPATCHED_OR_UNKNOWN"});
});
it("keeps quota reservations after uncertain calls and prevents another send",async()=>{
 const o={...options(),access:{...access(),maxSends:1}},a=await previewSupplierDelivery(p,{exportId,fileId,recipientId:"recipient"},o),b=await previewSupplierDelivery(p,{exportId,fileId,recipientId:"recipient"},o);
 for(const op of [a,b])await approveSupplierDelivery(p,{operationId:op.id,previewHash:op.previewHash,reference:"Cap test"},o);
 send.mockImplementationOnce(async input=>{const result={state:"NOT_SENT" as const,destinationId:input.destinationId,payloadHash:input.payloadHash};attempts.set(input.attemptId,result);return result;});
 expect((await sendSupplierDelivery(p,{operationId:a.id,previewHash:a.previewHash},o)).state).toBe("FAILED");
 await expect(sendSupplierDelivery(p,{operationId:b.id,previewHash:b.previewHash},o)).rejects.toMatchObject({code:"SUPPLIER_DELIVERY_QUOTA_EXCEEDED"});expect(send).toHaveBeenCalledTimes(1);
});
it("preserves the durable dispatch claim when settlement fails after remote success",async()=>{
 const op=await approved();let fail=true;const db={...f.db,$transaction:<T>(fn:Parameters<typeof f.db.$transaction<T>>[0])=>f.db.$transaction(tx=>fn({...tx,$executeRaw:async q=>{if(fail&&send.mock.calls.length&&q.text.includes('UPDATE "MerchandisingAction" SET context=')){fail=false;throw Error("Synthetic settlement outage");}return tx.$executeRaw(q);}}))};
 await expect(sendSupplierDelivery(p,{operationId:op.id,previewHash:op.previewHash},{...options(),db})).rejects.toThrow("Synthetic settlement outage");expect((await dispatch(op)).state).toBe("DISPATCHING");time=new Date(time.getTime()+31000);expect((await reconcileSupplierDelivery(p,{operationId:op.id},options())).state).toBe("SENT");expect(send).toHaveBeenCalledTimes(1);
});
it("can reconcile the original account after catalog/source changes without dispatching again",async()=>{
 const op=await approved();await dispatch(op);await saveSupplierRecipient(p,"recipient",{expectedRevision:1,recipient:{...recipient(),destinationId:"changed"}},f.db);await f.pg.exec(`UPDATE "ConnectorConnection" SET revision=2 WHERE "tenantId"='a'`);
 expect((await reconcileSupplierDelivery(p,{operationId:op.id},{...options(),access:{...access(),connectionRevision:2}})).state).toBe("SENT");expect(lookup).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(1);
 await expect(reconcileSupplierDelivery(p,{operationId:op.id},{...options(),access:{...access(),accountId:"other-account"}})).rejects.toMatchObject({code:"SUPPLIER_RECOVERY_ACCOUNT_CHANGED"});
});
it("separately previews, approves and executes cancellation, never treating a draft as consent",async()=>{
 const op=await approved();await dispatch(op);const draft=await previewSupplierCancellation(p,{operationId:op.id,reason:"Owner changes plan"},options()),hash=draft.cancellation!.previewHash;
 expect((await cancelSupplierDelivery(p,{operationId:op.id,cancellationHash:hash},options())).cancellation!.state).toBe("DRAFT");expect(cancel).not.toHaveBeenCalled();
 await approveSupplierCancellation(p,{operationId:op.id,cancellationHash:hash,reference:"Explicit cancellation approval"},options());
 const done=await cancelSupplierDelivery(p,{operationId:op.id,cancellationHash:hash},options());expect(done.state).toBe("CANCELLED");await cancelSupplierDelivery(p,{operationId:op.id,cancellationHash:hash},options());expect(cancel).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(1);
});
it("does not treat supplier acknowledgment as goods receipt and reuses posted receipt evidence",async()=>{
 const op=await approved();send.mockImplementationOnce(async input=>({...await sendImpl(input) as DeliveryOutcome,state:"ACKNOWLEDGED"}));expect((await dispatch(op)).state).toBe("ACKNOWLEDGED");
 const base={requestKey:randomUUID(),exportId,kind:"reorder",event:"SENT",occurredAt:time.toISOString(),evidenceReference:"Synthetic evidence",skuIds:op.rows.map(row=>String(row.skuId)),previousExecutionId:null,receiptIds:[]};
 const sent=await confirmScenarioExecution(p,base,f.db,time);await expect(recordSupplierGoodsReceipt(p,{operationId:op.id,executionId:sent.executionId},f.db)).rejects.toMatchObject({code:"SUPPLIER_GOODS_RECEIPT_UNVERIFIED"});
 const accepted=await confirmScenarioExecution(p,{...base,requestKey:randomUUID(),event:"ACCEPTED",previousExecutionId:sent.executionId},f.db,time);
 await f.pg.exec(`INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","movementType","postingVerifiedAt","receivedAt","observedAt","sourceRecordKey","supplierId","updatedAt") VALUES ('receipt110','a','source','inventory-run','receipt110','SUPPLIER_RECEIPT','2026-10-25T10:00:00Z','2026-10-25T10:00:00Z','2026-10-25T10:00:00Z','receipt110','supplier',now())`);
 for(const row of op.rows)await f.pg.query(`INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId","skuId",quantity) VALUES ($1,'a','receipt110',$1,$2,1)`,[randomUUID(),row.skuId]);
 const received=await confirmScenarioExecution(p,{...base,requestKey:randomUUID(),event:"RECEIVED",previousExecutionId:accepted.executionId,receiptIds:["receipt110"]},f.db,time);
 expect(await recordSupplierGoodsReceipt(p,{operationId:op.id,executionId:received.executionId},f.db)).toMatchObject({state:"RECEIVED",receiptEvidence:{receiptCoverage:"POSITIVE_VERIFIED_LINES_NOT_FULL_ORDER_COMPLETION"}});
});
it("keeps cancellation possible on the original account after normal data refresh, while pinning new approval",async()=>{
 const op=await approved();await dispatch(op);await f.pg.exec(`UPDATE "ConnectorConnection" SET revision=2 WHERE "tenantId"='a'`);
 const o={...options(),access:{...access(),connectionRevision:2}},draft=await previewSupplierCancellation(p,{operationId:op.id,reason:"Withdraw original order"},o),hash=draft.cancellation!.previewHash;
 await approveSupplierCancellation(p,{operationId:op.id,cancellationHash:hash,reference:"Separate withdrawal approval"},o);
 expect((await cancelSupplierDelivery(p,{operationId:op.id,cancellationHash:hash},o)).state).toBe("CANCELLED");expect(cancel.mock.calls[0][0]).toMatchObject({destinationId:"verified-destination",originalAttemptId:expect.any(String)});
});
it("never retries an uncertain cancellation and reconciles its own attempt separately",async()=>{
 const op=await approved();await dispatch(op);const draft=await previewSupplierCancellation(p,{operationId:op.id,reason:"Withdraw"},options()),hash=draft.cancellation!.previewHash;
 await approveSupplierCancellation(p,{operationId:op.id,cancellationHash:hash,reference:"Approved withdrawal"},options());
 const impl=cancel.getMockImplementation()!;cancel.mockImplementationOnce(async input=>{await impl(input);return new Promise(()=>{});});
 expect(await cancelSupplierDelivery(p,{operationId:op.id,cancellationHash:hash},{...options(),timeoutMs:1})).toMatchObject({state:"SENT",cancellation:{state:"UNKNOWN"}});
 await cancelSupplierDelivery(p,{operationId:op.id,cancellationHash:hash},options());expect(cancel).toHaveBeenCalledTimes(1);time=new Date(time.getTime()+31000);
 expect(await reconcileSupplierDelivery(p,{operationId:op.id},options())).toMatchObject({state:"CANCELLED",cancellation:{state:"CANCELLED"}});expect(send).toHaveBeenCalledTimes(1);
});
it("expires cancellation approval and rejects misleading cancellation receipts",async()=>{
 const op=await approved();await dispatch(op);const draft=await previewSupplierCancellation(p,{operationId:op.id,reason:"Withdraw"},options()),hash=draft.cancellation!.previewHash;
 await approveSupplierCancellation(p,{operationId:op.id,cancellationHash:hash,reference:"Approved withdrawal"},options());
 time=new Date(time.getTime()+15*60000);await expect(cancelSupplierDelivery(p,{operationId:op.id,cancellationHash:hash},options())).rejects.toMatchObject({code:"SUPPLIER_CANCELLATION_APPROVAL_EXPIRED"});expect(cancel).not.toHaveBeenCalled();
 time=new Date(screenSelection.now);cancel.mockImplementationOnce(async input=>({state:"CANCELLED",deliveryId:"different-order",destinationId:input.destinationId,payloadHash:input.payloadHash}));
 expect(await cancelSupplierDelivery(p,{operationId:op.id,cancellationHash:hash},options())).toMatchObject({state:"SENT",cancellation:{state:"UNKNOWN"}});
});
it("requires verified tenant catalog revisions, consent and matching supplier currency",async()=>{
 await expect(saveSupplierRecipient(p,"recipient",{expectedRevision:0,recipient:recipient()},f.db)).rejects.toMatchObject({code:"SUPPLIER_RECIPIENT_REVISION_CONFLICT"});
 await expect(saveSupplierRecipient(p,"unsafe",{expectedRevision:0,recipient:{...recipient(),consentReference:""}},f.db)).rejects.toMatchObject({code:"INVALID_SUPPLIER_RECIPIENT"});
 const draft=await saveSupplierRecipient(p,"recipient",{expectedRevision:1,recipient:{...recipient(),currencies:["USD"]}},f.db);await approveSupplierRecipient(p,"recipient",{configId:draft.configId,reference:"Different currency"},f.db,time);
 await expect(preview()).rejects.toMatchObject({code:"SUPPLIER_RECIPIENT_NOT_APPROVED_FOR_GROUP"});
});

it("handles partial multi-supplier delivery independently without replaying successful groups",async()=>{
 const first=await approved();expect((await dispatch(first)).state).toBe("SENT");
 const draft=await saveSupplierRecipient(p,"recipient-two",{expectedRevision:0,recipient:{...recipient(),supplierId:"supplier-two",destinationId:"second-destination"}},f.db);
 await approveSupplierRecipient(p,"recipient-two",{configId:draft.configId,reference:"Verified second supplier"},f.db,time);
 const second=await previewSupplierDelivery(p,{exportId,fileId:secondFileId,recipientId:"recipient-two"},options());
 await approveSupplierDelivery(p,{operationId:second.id,previewHash:second.previewHash,reference:"Second group approval"},options());
 send.mockImplementationOnce(async input=>({state:"UNKNOWN",destinationId:input.destinationId,payloadHash:input.payloadHash}));
 expect((await dispatch(second)).state).toBe("DELIVERY_UNKNOWN");expect((await dispatch(first)).state).toBe("SENT");expect(send).toHaveBeenCalledTimes(2);
 expect(send.mock.calls[0][0].destinationId).toBe("verified-destination");expect(send.mock.calls[1][0].destinationId).toBe("second-destination");
});
it("invalidates altered file bytes and changed source selection before sending",async()=>{
 const op=await approved(),original=(await f.pg.query<{after:unknown}>(`SELECT after FROM "MerchandisingAction" WHERE "idempotencyKey"=$1`,[`export:${exportId}`])).rows[0].after;
 await f.pg.query(`UPDATE "MerchandisingAction" SET after=jsonb_set(after,'{files,0,content}','"tampered"') WHERE "idempotencyKey"=$1`,[`export:${exportId}`]);
 try{await expect(dispatch(op)).rejects.toMatchObject({code:"SUPPLIER_EXPORT_INTEGRITY_FAILED"});}finally{await f.pg.query(`UPDATE "MerchandisingAction" SET after=$2::jsonb WHERE "idempotencyKey"=$1`,[`export:${exportId}`,JSON.stringify(original)]);}
 await f.pg.exec(`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision,"updatedAt") VALUES ('a','source',110,now())`);
 await expect(dispatch(op)).rejects.toMatchObject({code:"AI_CONTEXT_STALE"});expect(send).not.toHaveBeenCalled();
});
it("allows a new approved attempt only after terminal NOT_SENT proof fences the delayed original call",async()=>{
 const op=await approved();let release!:()=>void;const gate=new Promise<void>(r=>release=r);send.mockImplementationOnce(async input=>{await gate;return sendImpl(input);});
 const unknown=await sendSupplierDelivery(p,{operationId:op.id,previewHash:op.previewHash},{...options(),timeoutMs:1});
 attempts.set(unknown.attemptId!,{state:"NOT_SENT",destinationId:unknown.recipient.values.destinationId,payloadHash:unknown.payloadHash});time=new Date(time.getTime()+31000);
 expect((await reconcileSupplierDelivery(p,{operationId:op.id},options())).state).toBe("FAILED");release();await new Promise(r=>setTimeout(r,0));
 expect(attempts.get(unknown.attemptId!)!.state).toBe("NOT_SENT");const next=await approved();expect((await dispatch(next)).state).toBe("SENT");expect(send).toHaveBeenCalledTimes(2);
});
it("preserves unknown operation ownership if the original actor loses permission",async()=>{
 const op=await approved();send.mockImplementationOnce(async input=>({state:"UNKNOWN",destinationId:input.destinationId,payloadHash:input.payloadHash}));await dispatch(op);time=new Date(time.getTime()+31000);
 await f.pg.exec(`UPDATE "User" SET role='VIEWER' WHERE id='owner'`);
 try{
  await expect(reconcileSupplierDelivery(p,{operationId:op.id},options())).rejects.toMatchObject({code:"AI_FORBIDDEN"});
  await expect(reconcileSupplierDelivery({tenantId:"a",userId:"other110"},{operationId:op.id},options())).rejects.toMatchObject({code:"SUPPLIER_DELIVERY_NOT_FOUND"});expect(lookup).not.toHaveBeenCalled();
 }finally{await f.pg.exec(`UPDATE "User" SET role='ADMIN' WHERE id='owner'`);}
 expect((await readSupplierDelivery(p,op.id,f.db)).state).toBe("DELIVERY_UNKNOWN");
});
