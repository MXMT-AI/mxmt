import type { Lang } from "@/lib/translations";
import { settingsSheetsMappingCardCopyMessages as englishCopy } from "@/messages/en.json";
import { settingsSheetsMappingCardCopyMessages as ukrainianCopy } from "@/messages/uk.json";

const labels: Record<string, [string, string]> = {
  productId: [ukrainianCopy.productIdIDТовару, englishCopy.productId],
  sku: [ukrainianCopy.skuАртикул, "SKU"],
  name: [ukrainianCopy.nameНазва, englishCopy.name],
  brand: [ukrainianCopy.brandБренд, englishCopy.brand],
  category: [ukrainianCopy.categoryКатегорія, englishCopy.category],
  barcode: [ukrainianCopy.barcodeШтрихкод, englishCopy.barcode],
  retailPrice: [ukrainianCopy.retailPriceРоздрібнаЦіна, englishCopy.retailPrice],
  costPrice: [ukrainianCopy.costPriceСобівартістьОдиниці, englishCopy.costPriceUnitCost],
  quantity: [ukrainianCopy.quantityКількість, englishCopy.quantity],
  inTransit: [ukrainianCopy.inTransitУДорозі, englishCopy.inTransit],
  observedAt: [ukrainianCopy.observedAtЧасСпостереженняЗалишку, englishCopy.observedAtStockObservationTime],
  orderId: [ukrainianCopy.orderIdIDЗамовлення, englishCopy.orderId],
  lineId: [ukrainianCopy.lineIdIDРядкаЗамовлення, englishCopy.lineIdOrderLineID],
  statusId: [ukrainianCopy.statusIdСтатус, englishCopy.statusIdStatus],
  channelId: [ukrainianCopy.channelIdКанал, englishCopy.channelIdChannel],
  orderedAt: [ukrainianCopy.orderedAtЧасЗамовлення, englishCopy.orderedAtOrderTime],
  paidAt: [ukrainianCopy.paidAtДатаОплати, englishCopy.paidAtPaymentDate],
  returnedAt: [ukrainianCopy.returnedAtДатаПовернення, englishCopy.returnedAtReturnDate],
  updatedAt: [ukrainianCopy.updatedAtЧасЗміни, englishCopy.updatedAtUpdateTime],
  salesAmount: [ukrainianCopy.salesAmountСумаПродажу, englishCopy.salesAmount],
  costAmount: [ukrainianCopy.costAmountСобівартістьПродажу, englishCopy.costAmountSalesCost],
  UNKNOWN: [ukrainianCopy.uNKNOWNНеПідтверджено, englishCopy.uNKNOWNUnverified],
  SALE: [ukrainianCopy.sALEПродаж, englishCopy.sALE],
  RETURN: [ukrainianCopy.rETURNПовернення, englishCopy.rETURN],
  CORRECTION: [ukrainianCopy.cORRECTIONКоригування, englishCopy.cORRECTION],
  PREORDER: [ukrainianCopy.pREORDERПередзамовлення, englishCopy.pREORDER],
  REFUSAL: [ukrainianCopy.rEFUSALВідмова, englishCopy.rEFUSAL],
  MERCHANDISE: [ukrainianCopy.mERCHANDISEТовар, englishCopy.mERCHANDISE],
  SERVICE: [ukrainianCopy.sERVICEПослуга, englishCopy.sERVICE],
  GIFT_CARD: [ukrainianCopy.gIFTCARDПодарунковийСертифікат, englishCopy.gIFTCARD],
};
const errors: Record<string, [string, string]> = {
  INVALID_SHEETS_MAPPING: [
    ukrainianCopy.iNVALIDSHEETSMAPPINGПеревіртеВалютуОбовЯзковіПоляДати,
    englishCopy.iNVALIDSHEETSMAPPINGCheckCurrencyRequiredFieldsEvent,
  ],
  SHEETS_RAW_IMPORT_REQUIRED: [
    ukrainianCopy.sHEETSRAWIMPORTREQUIREDСпочаткуУспішноІмпортуйтеТаблицюВ,
    englishCopy.sHEETSRAWIMPORTREQUIREDImportTheWorkbookSuccessfullyIn,
  ],
  SHEETS_RAW_IMPORT_CHANGED: [
    ukrainianCopy.sHEETSRAWIMPORTCHANGEDІмпортЗмінивсяЗавантажтеЗіставленняЗнову,
    englishCopy.sHEETSRAWIMPORTCHANGEDTheImportChangedReloadThe,
  ],
  SHEETS_MAPPING_REVISION_CONFLICT: [
    ukrainianCopy.sHEETSMAPPINGREVISIONCONFLICTЄНовішаВерсіяЗавантажтеЗіставлення,
    englishCopy.sHEETSMAPPINGREVISIONCONFLICTANewerRevisionExistsReload,
  ],
  SHEETS_MAPPING_PREVIEW_EXPIRED: [
    ukrainianCopy.sHEETSMAPPINGPREVIEWEXPIREDТермінPreviewМинувПеревіртеЗіставлення,
    englishCopy.sHEETSMAPPINGPREVIEWEXPIREDThePreviewExpiredPreviewThe,
  ],
  SHEETS_MAPPING_HAS_BLOCKING_ERRORS: [
    ukrainianCopy.sHEETSMAPPINGHASBLOCKINGERRORSСпочаткуУсуньтеБлокувальніПомилки,
    englishCopy.sHEETSMAPPINGHASBLOCKINGERRORSResolveBlockingErrorsBeforeApproval,
  ],
};
export function mappingCaption(key: string, lang: Lang) {
  return labels[key]?.[lang === "uk" ? 0 : 1] ?? key;
}

export function mappingError(body: Record<string, unknown>, lang: Lang) {
  return errors[String(body.code)]?.[lang === "uk" ? 0 : 1] ?? (lang === "uk"
    ? ukrainianCopy.couldNotProcessMappingCheck
    : englishCopy.couldNotProcessMappingCheck);
}
