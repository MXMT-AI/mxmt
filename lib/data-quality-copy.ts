import type { Lang } from "./translations";
import { dataQualityCopyMessages as englishCopy } from "@/messages/en.json";
import { dataQualityCopyMessages as ukrainianCopy } from "@/messages/uk.json";
const issues: Record<string, [string, string, string, string]> = {
  CATALOG_LEGACY_SKU_COLLISION: [
    englishCopy.cATALOGLEGACYSKUCOLLISIONLegacySKUCollision, ukrainianCopy.cATALOGLEGACYSKUCOLLISIONЗбігІзLegacySKU,
    englishCopy.cATALOGLEGACYSKUCOLLISIONTheExistingSheetsIdentityAnd,
    ukrainianCopy.cATALOGLEGACYSKUCOLLISIONНаявнийЗаписSheetsТаЙого,
  ],
  PRODUCT_KIND_UNVERIFIED: [
    englishCopy.pRODUCTKINDUNVERIFIEDUnverifiedProductType, ukrainianCopy.pRODUCTKINDUNVERIFIEDТипТоваруНеПідтверджено,
    englishCopy.pRODUCTKINDUNVERIFIEDTheseMovementsAreExcludedFrom,
    ukrainianCopy.pRODUCTKINDUNVERIFIEDЦіРухиНеВходятьДо,
  ],
  STOCK_QUANTITY_UNAVAILABLE: [
    englishCopy.sTOCKQUANTITYUNAVAILABLEUnknownStock, ukrainianCopy.sTOCKQUANTITYUNAVAILABLEНевідомийЗалишок,
    englishCopy.sTOCKQUANTITYUNAVAILABLETheCatalogueIsPresentBut,
    ukrainianCopy.sTOCKQUANTITYUNAVAILABLEКаталогЄАлеНемаєПідтвердженого,
  ],
  MISSING_BRAND: [
    englishCopy.mISSINGBRAND,
    ukrainianCopy.mISSINGBRANDНеЗаповненоБренд,
    englishCopy.mISSINGBRANDBrandTotalsAndRepricingNeed,
    ukrainianCopy.mISSINGBRANDДляПідсумківБрендуЙУцінки,
  ],
  MISSING_CATEGORY: [
    englishCopy.mISSINGCATEGORY,
    ukrainianCopy.mISSINGCATEGORYНеЗаповненоКатегорію,
    englishCopy.mISSINGCATEGORYCategoryTotalsAndSeasonalRules,
    ukrainianCopy.mISSINGCATEGORYДляПідсумківІСезонностіПотрібна,
  ],
  MISSING_COST: [
    englishCopy.mISSINGCOSTMissingOrInvalidCost,
    ukrainianCopy.mISSINGCOSTНемаєКоректноїСобівартості,
    englishCopy.mISSINGCOSTStockValueOwnStockProfitAnd,
    ukrainianCopy.mISSINGCOSTВартістьЗалишкуПрибутокВласногоСтоку,
  ],
  ZERO_PRICE_WITH_STOCK: [
    englishCopy.zEROPRICEWITHSTOCK,
    ukrainianCopy.zEROPRICEWITHSTOCKНульоваЦінаПриЗалишку,
    englishCopy.zEROPRICEWITHSTOCKRepricingExcludesTheseRowsCorrect,
    ukrainianCopy.zEROPRICEWITHSTOCKЦіРядкиВиключеноЗУцінки,
  ],
  OWNERSHIP_UNKNOWN: [
    englishCopy.oWNERSHIPUNKNOWNUnknownOwnership,
    ukrainianCopy.oWNERSHIPUNKNOWNНевідомаВласність,
    englishCopy.oWNERSHIPUNKNOWNProfitCoverageAndPurchaseRecommendations,
    ukrainianCopy.oWNERSHIPUNKNOWNДляПрибуткуЙЗакупівельПотрібна,
  ],
  COMMISSION_UNKNOWN: [
    englishCopy.cOMMISSIONUNKNOWNUnknownCommission,
    ukrainianCopy.cOMMISSIONUNKNOWNНевідомаКомісія,
    englishCopy.cOMMISSIONUNKNOWNConsignmentProfitIsUnavailableUntil,
    ukrainianCopy.cOMMISSIONUNKNOWNПрибутокРеалізаціїНедоступнийБезПогодженої,
  ],
  SUPPLIER_UNKNOWN: [
    englishCopy.sUPPLIERUNKNOWNMissingSupplier,
    ukrainianCopy.sUPPLIERUNKNOWNНемаєПостачальника,
    englishCopy.sUPPLIERUNKNOWNSupplierExportsNeedAStable,
    ukrainianCopy.sUPPLIERUNKNOWNДляЕкспортуПотрібенПостачальникНалаштуйте,
  ],
  SUPPLIER_TERMS_UNVERIFIED: [
    englishCopy.sUPPLIERTERMSUNVERIFIEDUnverifiedSupplierTerms,
    ukrainianCopy.sUPPLIERTERMSUNVERIFIEDУмовиПостачальникаНеПідтверджені,
    englishCopy.sUPPLIERTERMSUNVERIFIEDClientDefaultsCanSupportA,
    ukrainianCopy.sUPPLIERTERMSUNVERIFIEDПопереднійРозрахунокВикористовуєТиповіЗначення,
  ],
  SUPPLIER_LEAD_TIME_MISSING: [
    englishCopy.sUPPLIERLEADTIMEMISSINGMissingSupplierLeadTime,
    ukrainianCopy.sUPPLIERLEADTIMEMISSINGНемаєПлечаПостачальника,
    englishCopy.sUPPLIERLEADTIMEMISSINGTheApprovedClientLeadTime,
    ukrainianCopy.sUPPLIERLEADTIMEMISSINGВикористовуєтьсяПогодженеТиповеПлечеКлієнта,
  ],
  IN_TRANSIT_UNKNOWN: [
    englishCopy.iNTRANSITUNKNOWNUnknownStockInTransit,
    ukrainianCopy.iNTRANSITUNKNOWNНевідомийТоварУДорозі,
    englishCopy.iNTRANSITUNKNOWNFinalReorderingNeedsVerifiedTransit,
    ukrainianCopy.iNTRANSITUNKNOWNДляДозамовленняПотрібнаПеревіренаКількість,
  ],
  SKU_ALIAS_UNRESOLVED: [
    englishCopy.sKUALIASUNRESOLVEDUnmatchedSaleSKU,
    ukrainianCopy.sKUALIASUNRESOLVEDSKUПродажуНеЗнайдено,
    englishCopy.sKUALIASUNRESOLVEDThisLineCannotEnterSKU,
    ukrainianCopy.sKUALIASUNRESOLVEDРядокНеВходитьДоМетрик,
  ],
};
const other: Record<string, [string, string]> = {
  INVALID_SOURCE_DATE: [englishCopy.iNVALIDSOURCEDATE, ukrainianCopy.iNVALIDSOURCEDATEНекоректнаДатаДжерела],
  BRAND_IDENTITY_CONFLICT: [englishCopy.bRANDIDENTITYCONFLICTAmbiguousBrand, ukrainianCopy.bRANDIDENTITYCONFLICTНеоднозначнийБренд],
  MISSING_PRICE: [englishCopy.mISSINGPRICEMissingRetailPrice, ukrainianCopy.mISSINGPRICEНемаєРоздрібноїЦіни],
  MISSING_RECEIPT_DATE: [englishCopy.mISSINGRECEIPTDATE, ukrainianCopy.mISSINGRECEIPTDATEНемаєДатиНадходження],
  NEGATIVE_STOCK: [englishCopy.nEGATIVESTOCK, ukrainianCopy.nEGATIVESTOCKВідЄмнийЗалишок],
  NEGATIVE_PRODUCT_AGE: [englishCopy.nEGATIVEPRODUCTAGEInvalidReceiptDate, ukrainianCopy.nEGATIVEPRODUCTAGEНекоректнаДатаНадходження],
  PRODUCT_KIND_UNVERIFIED: [
    englishCopy.pRODUCTKINDUNVERIFIEDUnverifiedProductType,
    ukrainianCopy.pRODUCTKINDUNVERIFIEDТипТоваруНеПідтверджено,
  ],
  STOCK_QUANTITY_UNAVAILABLE: [englishCopy.sTOCKQUANTITYUNAVAILABLEUnknownStock, ukrainianCopy.sTOCKQUANTITYUNAVAILABLEНевідомийЗалишок],
  NEGATIVE_METRIC: [englishCopy.nEGATIVEMETRIC, ukrainianCopy.nEGATIVEMETRICВідЄмнаМетрика],
  EXCLUDED_CHANNEL: [englishCopy.eXCLUDEDCHANNEL, ukrainianCopy.eXCLUDEDCHANNELВиключенийКанал],
  EXCLUDED_PROJECT: [englishCopy.eXCLUDEDPROJECT, ukrainianCopy.eXCLUDEDPROJECTВиключенийПроєкт],
  PROJECT_MAPPING_UNVERIFIED: [
    englishCopy.pROJECTMAPPINGUNVERIFIEDUnverifiedProjectMapping,
    ukrainianCopy.pROJECTMAPPINGUNVERIFIEDПолеПроєктуНеПідтверджено,
  ],
  SIGNED_CORRECTION: [englishCopy.sIGNEDCORRECTION, ukrainianCopy.sIGNEDCORRECTIONПідписанеКоригування],
  RETURN_DATE_UNAVAILABLE: [englishCopy.rETURNDATEUNAVAILABLEUnknownReturnDate, ukrainianCopy.rETURNDATEUNAVAILABLEНевідомаДатаПовернення],
  INFERRED_PAYMENT_DATE: [englishCopy.iNFERREDPAYMENTDATEInferredSaleDate, ukrainianCopy.iNFERREDPAYMENTDATEПрипущенаДатаПродажу],
};
export const qualityLabel = (code: string, lang: Lang) =>
  issues[code]?.[lang === "uk" ? 1 : 0] ??
  other[code]?.[lang === "uk" ? 1 : 0] ??
  code;
export const qualityGuidance = (code: string, lang: Lang) =>
  issues[code]?.[lang === "uk" ? 3 : 2] ??
  (lang === "uk"
    ? ukrainianCopy.qualityGuidanceReviewRowLineageCorrectSource
    : englishCopy.qualityGuidanceReviewRowLineageCorrectSource);
export const qualityFixHref = (code: string) =>
  [
    "OWNERSHIP_UNKNOWN",
    "COMMISSION_UNKNOWN",
    "SUPPLIER_UNKNOWN",
    "SUPPLIER_TERMS_UNVERIFIED",
    "SUPPLIER_LEAD_TIME_MISSING",
  ].includes(code)
    ? "/settings?tab=merchandising"
    : "/settings?tab=general#data-quality-title";
