import { importStateLabels as importStateLabelsEn, settingsSalesDriveImportCardCopyMessages as englishCopy } from "@/messages/en.json";
import { importStateLabels as importStateLabelsUk, settingsSalesDriveImportCardCopyMessages as ukrainianCopy } from "@/messages/uk.json";

export const importStateLabels: Record<"uk" | "en", Record<string, string>> = { uk: importStateLabelsUk, en: importStateLabelsEn };

const issueLabels: Record<string, [string, string]> = {
  NEGATIVE_SOURCE_STOCK: [
    englishCopy.nEGATIVESOURCESTOCK,
    ukrainianCopy.nEGATIVESOURCESTOCKВідЄмнийЗалишокЗбереженоЯкПомилку,
  ],
  NEGATIVE_MOVEMENT_QUANTITY: [
    englishCopy.nEGATIVEMOVEMENTQUANTITYAMovementHasANegative,
    ukrainianCopy.nEGATIVEMOVEMENTQUANTITYРухМаєВідЄмнуКількістьВін,
  ],
  STALE_CATALOG_OBSERVATION: [
    englishCopy.sTALECATALOGOBSERVATIONAnOlderFeedObservationWas,
    ukrainianCopy.sTALECATALOGOBSERVATIONСтарішеСпостереженняПропущеноНовішіДані,
  ],
  HISTORICAL_STOCK_UNAVAILABLE: [
    englishCopy.hISTORICALSTOCKUNAVAILABLEEarlierStockCannotBeReconstructed,
    ukrainianCopy.hISTORICALSTOCKUNAVAILABLEЗПоточногоФайлуНеможливоВідновити,
  ],
  RECEIPT_POSTING_UNVERIFIED: [
    englishCopy.rECEIPTPOSTINGUNVERIFIEDVerifyReceiptPostingStatusesAnd,
    ukrainianCopy.rECEIPTPOSTINGUNVERIFIEDПеревіртеСтатусиПроведенняЙВідповідність,
  ],
  RECEIPT_DATE_UNAVAILABLE: [
    englishCopy.rECEIPTDATEUNAVAILABLESomeReceiptDatesAreMissing,
    ukrainianCopy.rECEIPTDATEUNAVAILABLEДеякіДатиНадходженьВідсутніАбо,
  ],
  INVALID_RECEIPT_LINE: [
    englishCopy.iNVALIDRECEIPTLINESomeReceiptsHaveInvalidQuantities,
    ukrainianCopy.iNVALIDRECEIPTLINEДеякіНадходженняМістятьНекоректніКількості,
  ],
  RECEIPTS_NOT_CONFIGURED: [
    englishCopy.rECEIPTSNOTCONFIGUREDAReceiptsReadKeyIs,
    ukrainianCopy.rECEIPTSNOTCONFIGUREDКлючЧитанняНадходженьНеНалаштовано,
  ],
  DERIVED_RECEIPT_LINE_IDENTITY: [
    englishCopy.dERIVEDRECEIPTLINEIDENTITYReceiptLineIdentityIsDerived,
    ukrainianCopy.dERIVEDRECEIPTLINEIDENTITYIDРядківНадходженьПохідніПоточні,
  ],
  RECEIPT_VERSION_CONFLICT: [
    englishCopy.rECEIPTVERSIONCONFLICTConflictingReceiptVersionsWereRetained,
    ukrainianCopy.rECEIPTVERSIONCONFLICTСуперечливіВерсіїНадходженняЗбереженоДля,
  ],
  STOCK_QUANTITY_UNAVAILABLE: [
    englishCopy.sTOCKQUANTITYUNAVAILABLESomeStockQuantitiesAreUnknown,
    ukrainianCopy.sTOCKQUANTITYUNAVAILABLEДеякіЗалишкиНевідоміВониНе,
  ],
  RETAIL_PRICE_UNAVAILABLE: [
    englishCopy.rETAILPRICEUNAVAILABLESomeRetailPricesAreUnavailable,
    ukrainianCopy.rETAILPRICEUNAVAILABLEДеякіРоздрібніЦіниНедоступні,
  ],
  CURRENCY_UNVERIFIED: [
    englishCopy.cURRENCYUNVERIFIEDVerifyTheFeedCurrencyBefore,
    ukrainianCopy.cURRENCYUNVERIFIEDПеревіртеВалютуФайлуПередОбЄднанням,
  ],
  MISSING_SOURCE_SKU: [
    englishCopy.mISSINGSOURCESKUSomeProductsHaveNoArticle,
    ukrainianCopy.mISSINGSOURCESKUДеякіТовариНеМаютьАртикула,
  ],
  STATUS_MAPPING_UNVERIFIED: [
    englishCopy.sTATUSMAPPINGUNVERIFIEDVerifyWhichSourceStatusesCount,
    ukrainianCopy.sTATUSMAPPINGUNVERIFIEDПеревіртеВідповідністьСтатусівПродажамІ,
  ],
  CHANNEL_MAPPING_UNVERIFIED: [
    englishCopy.cHANNELMAPPINGUNVERIFIEDVerifySourceChannelIDsAnd,
    ukrainianCopy.cHANNELMAPPINGUNVERIFIEDПеревіртеІдентифікаториТаНазвиКаналів,
  ],
  CHANNEL_METADATA_UNVERIFIED: [
    englishCopy.cHANNELMETADATAUNVERIFIEDChannelMetadataNeedsAccountVerification,
    ukrainianCopy.cHANNELMETADATAUNVERIFIEDДовідникКаналівПотребуєПеревіркиДля,
  ],
  DERIVED_LINE_IDENTITY: [
    englishCopy.dERIVEDLINEIDENTITYTheSourceHasNoStable,
    ukrainianCopy.dERIVEDLINEIDENTITYДжерелоНеНадаєСтабільнихID,
  ],
  REVENUE_MAPPING_UNVERIFIED: [
    englishCopy.rEVENUEMAPPINGUNVERIFIEDRevenueIsUnavailableUntilPrice,
    ukrainianCopy.rEVENUEMAPPINGUNVERIFIEDВиручкаНедоступнаДокиНеПеревірено,
  ],
  COST_UNVERIFIED: [
    englishCopy.cOSTUNVERIFIEDCostIsUnavailableOrIts,
    ukrainianCopy.cOSTUNVERIFIEDСобівартістьНедоступнаАбоЇїВідповідність,
  ],
  RETURN_DATE_UNAVAILABLE: [
    englishCopy.rETURNDATEUNAVAILABLETheSourceDoesNotSupply,
    ukrainianCopy.rETURNDATEUNAVAILABLEДжерелоНеНадаєДатуПовернення,
  ],
  PAYMENT_DATE_UNAVAILABLE: [
    englishCopy.pAYMENTDATEUNAVAILABLEAPaidOrderHasNo,
    ukrainianCopy.pAYMENTDATEUNAVAILABLEОплаченеЗамовленняНеМаєКоректної,
  ],
  PAYMENT_DATE_PRECISION: [
    englishCopy.pAYMENTDATEPRECISIONPaymentDatesHaveDayPrecision,
    ukrainianCopy.pAYMENTDATEPRECISIONДатаОплатиМаєТочністьДо,
  ],
  INVALID_SOURCE_DATE: [
    englishCopy.iNVALIDSOURCEDATEASourceDateIsInvalid,
    ukrainianCopy.iNVALIDSOURCEDATEДатаДжерелаНекоректнаАбоНеоднозначна,
  ],
  SKU_ALIAS_UNRESOLVED: [
    englishCopy.sKUALIASUNRESOLVEDSomeProductsAreNotLinked,
    ukrainianCopy.sKUALIASUNRESOLVEDДеякіТовариЩеНеПовЯзані,
  ],
  SKU_ALIAS_CONFLICT: [
    englishCopy.sKUALIASCONFLICTProductIdentifiersPointToDifferent,
    ukrainianCopy.sKUALIASCONFLICTІдентифікаториТоваруВказуютьНаРізні,
  ],
  SOURCE_PAGINATION_NOT_SNAPSHOT: [
    englishCopy.sOURCEPAGINATIONNOTSNAPSHOTSalesDrivePagesAreNotA,
    ukrainianCopy.sOURCEPAGINATIONNOTSNAPSHOTСторінкиSalesDriveНеЄНезмінним,
  ],
  ORDER_VERSION_CONFLICT: [
    englishCopy.oRDERVERSIONCONFLICTConflictingOrderVersionsWereRetained,
    ukrainianCopy.oRDERVERSIONCONFLICTСуперечливіВерсіїЗамовленняЗбереженоДля,
  ],
  INVALID_QUANTITY: [
    englishCopy.iNVALIDQUANTITYSomeQuantitiesAreInvalidAffected,
    ukrainianCopy.iNVALIDQUANTITYДеякіКількостіНекоректніВідповідніЗамовлення,
  ],
  DUPLICATE_SOURCE_LINE_ID: [
    englishCopy.dUPLICATESOURCELINEIDAnOrderContainsDuplicateSource,
    ukrainianCopy.dUPLICATESOURCELINEIDЗамовленняМіститьПовтореніIDРядків,
  ],
  AMOUNT_OVERFLOW: [
    englishCopy.aMOUNTOVERFLOWAnAmountExceedsSupportedPrecision,
    ukrainianCopy.aMOUNTOVERFLOWСумаПеревищуєПідтримувануТочність,
  ],
};

export function issueLabel(code: string, uk: boolean, generic = false) {
  if(generic&&code==="SOURCE_PAGINATION_NOT_SNAPSHOT")return uk?ukrainianCopy.sourcePagesMayChangeWhile:englishCopy.sourcePagesMayChangeWhile;
  if(generic&&code==="INVALID_RECEIPT_LINE")return uk?ukrainianCopy.invalidReceiptsWereSkippedCorrect:englishCopy.invalidReceiptsWereSkippedCorrect;
  return (
    issueLabels[code]?.[uk ? 1 : 0] ??
    (uk ? ukrainianCopy.sourceDataNeedsReview : englishCopy.sourceDataNeedsReview)
  );
}

const errorLabels: Record<string, [string, string]> = {
  RATE_LIMITED: [
    englishCopy.rATELIMITEDTheAccountRequestLimitWas,
    ukrainianCopy.rATELIMITEDДосягнутоЛімітуЗапитівАкаунтаІмпорт,
  ],
  AUTH_FAILED: [
    englishCopy.aUTHFAILEDCheckTheSavedSalesDriveRead,
    ukrainianCopy.aUTHFAILEDПеревіртеЗбереженийКлючЧитанняSalesDrive,
  ],
  NOT_CONFIGURED: [
    englishCopy.nOTCONFIGUREDSaveASalesDriveConnectionThen,
    ukrainianCopy.nOTCONFIGUREDЗбережітьЗЄднанняSalesDriveПотімВідновіть,
  ],
  CONNECTOR_CONFIG_CHANGED: [
    englishCopy.cONNECTORCONFIGCHANGEDTheConnectionChangedCheckIt,
    ukrainianCopy.cONNECTORCONFIGCHANGEDЗЄднанняЗмінилосяПеревіртеЙогоПотім,
  ],
  TIMEOUT: [
    englishCopy.tIMEOUTSalesDriveDidNotRespondIn,
    ukrainianCopy.tIMEOUTSalesDriveНеВідповівВчасноІмпорт,
  ],
  NETWORK_ERROR: [
    englishCopy.nETWORKERRORSalesDriveIsTemporarilyUnavailableThe,
    ukrainianCopy.nETWORKERRORSalesDriveТимчасовоНедоступнийІмпортПовториться,
  ],
  INVALID_RESPONSE: [
    englishCopy.iNVALIDRESPONSESalesDriveReturnedAnUnexpectedResponse,
    ukrainianCopy.iNVALIDRESPONSESalesDriveПовернувНеочікувануВідповідьПеревірте,
  ],
};

export function errorLabel(code: string, uk: boolean, generic = false) {
  if(generic&&["AUTH_FAILED","NOT_CONFIGURED","CONNECTOR_PROVIDER_UNAVAILABLE","CONNECTOR_BUDGET_UNVERIFIED"].includes(code))return uk?ukrainianCopy.completeConnectionSetupAndCheck:englishCopy.completeConnectionSetupAndCheck;
  if(generic&&["TIMEOUT","NETWORK_ERROR","INVALID_RESPONSE"].includes(code))return uk?ukrainianCopy.theSourceDidNotReturn:englishCopy.theSourceDidNotReturn;
  return (
    errorLabels[code]?.[uk ? 1 : 0] ??
    (uk
      ? ukrainianCopy.theImportCouldNotFinish
      : englishCopy.theImportCouldNotFinish)
  );
}
