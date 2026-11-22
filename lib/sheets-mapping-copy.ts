import { sheetsMappingCopyMessages as englishCopy } from "@/messages/en.json";
import { sheetsMappingCopyMessages as ukrainianCopy } from "@/messages/uk.json";

const copy: Record<string, [string, string]> = {
  MAPPING_DICTIONARY_LIMIT: [
    ukrainianCopy.mAPPINGDICTIONARYLIMITЗабагатоСтатусівКаналівАбоКатегорій,
    englishCopy.mAPPINGDICTIONARYLIMITTooManyStatusesChannelsOr,
  ],
  PRODUCT_ID_MISSING: [ukrainianCopy.pRODUCTIDMISSINGНемаєIDТовару, englishCopy.pRODUCTIDMISSINGMissingProductID],
  PRODUCT_ID_DUPLICATE: [ukrainianCopy.pRODUCTIDDUPLICATEПовторюєтьсяIDТовару, englishCopy.pRODUCTIDDUPLICATEDuplicateProductID],
  PRODUCT_NAME_MISSING: [ukrainianCopy.pRODUCTNAMEMISSINGНемаєНазвиТовару, englishCopy.pRODUCTNAMEMISSINGMissingProductName],
  PRODUCT_SKU_AMBIGUOUS: [
    ukrainianCopy.pRODUCTSKUAMBIGUOUSАртикулВідповідаєКількомТоварам,
    englishCopy.pRODUCTSKUAMBIGUOUSSKUMatchesMultipleProducts,
  ],
  STOCK_QUANTITY_INVALID: [
    ukrainianCopy.sTOCKQUANTITYINVALIDЗалишокМаєНекоректнеЗначення,
    englishCopy.sTOCKQUANTITYINVALIDInvalidStockQuantity,
  ],
  PRODUCT_VALUE_UNAVAILABLE: [
    ukrainianCopy.pRODUCTVALUEUNAVAILABLEЗначенняЦіниАбоКількостіПотребує,
    englishCopy.pRODUCTVALUEUNAVAILABLEPriceOrQuantityNeedsReview,
  ],
  STOCK_OBSERVATION_UNVERIFIED: [
    ukrainianCopy.sTOCKOBSERVATIONUNVERIFIEDЧасСпостереженняЗалишкуНеПідтверджено,
    englishCopy.sTOCKOBSERVATIONUNVERIFIEDStockObservationTimeIsUnverified,
  ],
  ORDER_ID_MISSING: [ukrainianCopy.oRDERIDMISSINGНемаєIDЗамовлення, englishCopy.oRDERIDMISSINGMissingOrderID],
  ORDER_PRODUCT_UNMATCHED: [
    ukrainianCopy.oRDERPRODUCTUNMATCHEDНеЗнайденоВідповіднийТовар,
    englishCopy.oRDERPRODUCTUNMATCHEDProductCouldNotBeMatched,
  ],
  ORDER_PRODUCT_IDENTITY_CONFLICT: [
    ukrainianCopy.oRDERPRODUCTIDENTITYCONFLICTIDТоваруТаАртикулСуперечать,
    englishCopy.oRDERPRODUCTIDENTITYCONFLICTProductIDAndSKUConflict,
  ],
  ORDER_LINE_ID_MISSING: [
    ukrainianCopy.oRDERLINEIDMISSINGНемаєСтабільногоIDРядка,
    englishCopy.oRDERLINEIDMISSINGMissingStableLineID,
  ],
  ORDER_LINE_AMBIGUOUS: [
    ukrainianCopy.oRDERLINEAMBIGUOUSРядокЗамовленняНеоднозначнийАбоПовторюється,
    englishCopy.oRDERLINEAMBIGUOUSOrderLineIsAmbiguousOr,
  ],
  ORDER_STATUS_UNMAPPED: [ukrainianCopy.oRDERSTATUSUNMAPPEDСтатусНеЗіставлено, englishCopy.oRDERSTATUSUNMAPPEDStatusIsNotMapped],
  ORDER_QUANTITY_INVALID: [
    ukrainianCopy.oRDERQUANTITYINVALIDКількістьУЗамовленніНекоректна,
    englishCopy.oRDERQUANTITYINVALIDInvalidOrderQuantity,
  ],
  ORDER_AMOUNT_INVALID: [ukrainianCopy.oRDERAMOUNTINVALIDСумаПродажуНекоректна, englishCopy.oRDERAMOUNTINVALIDInvalidSalesAmount],
  ORDER_COST_UNAVAILABLE: [
    ukrainianCopy.oRDERCOSTUNAVAILABLEСобівартістьНеПідтверджено,
    englishCopy.oRDERCOSTUNAVAILABLECostIsUnverified,
  ],
  SALE_DATE_UNVERIFIED: [
    ukrainianCopy.sALEDATEUNVERIFIEDДатаОплатиНеПідтверджена,
    englishCopy.sALEDATEUNVERIFIEDPaymentDateIsUnverified,
  ],
  CORRECTION_DATE_UNVERIFIED: [
    ukrainianCopy.cORRECTIONDATEUNVERIFIEDДатаКоригуванняНеПідтверджена,
    englishCopy.cORRECTIONDATEUNVERIFIEDCorrectionDateIsUnverified,
  ],
  RETURN_DATE_UNVERIFIED: [
    ukrainianCopy.rETURNDATEUNVERIFIEDДатаПоверненняНеПідтверджена,
    englishCopy.rETURNDATEUNVERIFIEDReturnDateIsUnverified,
  ],
  ORDER_CHANNEL_UNMAPPED: [ukrainianCopy.oRDERCHANNELUNMAPPEDКаналНеЗіставлено, englishCopy.oRDERCHANNELUNMAPPEDChannelIsNotMapped],
  DUPLICATE_PRODUCT_IDENTITIES: [
    ukrainianCopy.dUPLICATEPRODUCTIDENTITIESПотрібноУсунутиДублікатиIDТоварів,
    englishCopy.dUPLICATEPRODUCTIDENTITIESResolveDuplicateProductIDs,
  ],
  EMPTY_PRODUCT_SNAPSHOT: [
    ukrainianCopy.eMPTYPRODUCTSNAPSHOTУВибраномуІмпортіНемаєТоварів,
    englishCopy.eMPTYPRODUCTSNAPSHOTTheSelectedImportContainsNo,
  ],
  AMBIGUOUS_ORDER_LINES_REQUIRE_QUARANTINE: [
    ukrainianCopy.aMBIGUOUSORDERLINESREQUIREQUARANTINEНеоднозначніРядкиПотребуютьОкремогоРозгляду,
    englishCopy.aMBIGUOUSORDERLINESREQUIREQUARANTINEAmbiguousLinesNeedSeparateReview,
  ],
  UNMAPPED_STATUSES_EXCLUDED: [
    ukrainianCopy.uNMAPPEDSTATUSESEXCLUDEDНепідтвердженіСтатусиНеПотраплятьУ,
    englishCopy.uNMAPPEDSTATUSESEXCLUDEDUnverifiedStatusesWillBeExcluded,
  ],
  PRODUCT_KIND_REVIEW_REQUIRED: [
    ukrainianCopy.pRODUCTKINDREVIEWREQUIREDПотрібноВизначитиТипиПозиційТовар,
    englishCopy.pRODUCTKINDREVIEWREQUIREDClassifyMerchandiseServicesAndGift,
  ],
  STOCK_IS_IMPORT_OBSERVATION_NOT_HISTORICAL_CLOSE: [
    ukrainianCopy.sTOCKISIMPORTOBSERVATIONNOTHISTORICALCLOSEЗалишкиСпостерігаютьсяПідЧасІмпорту,
    englishCopy.sTOCKISIMPORTOBSERVATIONNOTHISTORICALCLOSEStockIsObservedDuringImport,
  ],
  IN_TRANSIT_UNKNOWN: [
    ukrainianCopy.iNTRANSITUNKNOWNКількістьТоварівУДорозіНевідома,
    englishCopy.iNTRANSITUNKNOWNInTransitQuantityIsUnknown,
  ],
  HISTORY_COVERAGE_NOT_CONFIRMED: [
    ukrainianCopy.hISTORYCOVERAGENOTCONFIRMEDПовнотаІсторіїПродажівНеПідтверджена,
    englishCopy.hISTORYCOVERAGENOTCONFIRMEDSalesHistoryCompletenessIsUnverified,
  ],
  OWNERSHIP_AND_SUPPLIER_TERMS_REQUIRE_SETTINGS: [
    ukrainianCopy.oWNERSHIPANDSUPPLIERTERMSREQUIRESETTINGSТипВласностіТаУмовиПостачальників,
    englishCopy.oWNERSHIPANDSUPPLIERTERMSREQUIRESETTINGSConfirmOwnershipAndSupplierTerms,
  ],
  RECEIPT_EVIDENCE_NOT_IMPORTED: [
    ukrainianCopy.rECEIPTEVIDENCENOTIMPORTEDПідтвердженіДокументиНадходженняЩеНе,
    englishCopy.rECEIPTEVIDENCENOTIMPORTEDVerifiedSupplierReceiptsAreNot,
  ],
};
export const sheetsMappingMessage = (code: string, lang: "uk" | "en") =>
  copy[code]?.[lang === "uk" ? 0 : 1] ??
  (lang === "uk"
    ? ukrainianCopy.sheetsMappingMessageAdditionalDataReviewIsRequired
    : englishCopy.sheetsMappingMessageAdditionalDataReviewIsRequired);
