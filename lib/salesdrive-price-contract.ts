/** Audited public schema, not account access approval or a registered write transport. */
export const SALESDRIVE_PRICE_CONTRACT={
 version:1,checkedOn:"2026-10-29",specificationUrl:"https://api.salesdrive.me/swagger/openapi-uk.php",
 specificationSha256:"44a6c30a2aaa466cbf7cdf5cb0225a0ad3b1c7cabacaa5a907bad1114653110e",
 path:"/product-handler/",method:"POST",action:"update",productIdField:"id",priceField:"costPerItem",currencyField:"currency",documentedBatchLimit:100,
 credentialsHeader:"X-Api-Key",existingOnlyUpdateDocumented:false,atomicCompareAndSetDocumented:false,perItemReceiptDocumented:false,
 productionAdapterRegistered:false,
} as const;
/** Price-only body serialization is offline preparation; lack of existing-only/CAS semantics still blocks live dispatch. */
export function salesDrivePriceBody(productId:string,price:string,currency:string){
 if(!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(productId)||!/^\d{1,12}(\.\d{1,2})?$/.test(price)||!/[1-9]/.test(price)||currency!=="UAH")throw new Error("INVALID_SALESDRIVE_PRICE_BODY");
 const protectedFields=["discount","additionalPriceDiscount","name","description","images","nameForDocuments","nameTranslate","descriptionTranslate","expenses","sku","manufacturer","weight","volume","length","width","height","barcode","uktzed","url","note","supplier","keywords","params"];
 // Emit the validated decimal token without a floating-point round trip or any client-controlled field name.
 return `{"action":"update","dontUpdateFields":${JSON.stringify(protectedFields)},"product":[{"id":${JSON.stringify(productId)},"costPerItem":${price.replace(/^0+(?=\d)/,"")},"currency":"UAH"}]}`;
}
