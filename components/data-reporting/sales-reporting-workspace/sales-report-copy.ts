import type { Locale } from "@/i18n/routing";
import type { SalesView } from "@/lib/sales-report-view";
import { salesWorkspaceCopy as salesWorkspaceCopyEn, dataReportingSalesReportingWorkspaceSalesReportCopyMessages as englishCopy, fallbackError as fallbackErrorEn } from "@/messages/en.json";
import { salesWorkspaceCopy as salesWorkspaceCopyUk, dataReportingSalesReportingWorkspaceSalesReportCopyMessages as ukrainianCopy, fallbackError as fallbackErrorUk } from "@/messages/uk.json";

export const salesWorkspaceCopy = { uk: salesWorkspaceCopyUk, en: salesWorkspaceCopyEn } satisfies Record<Locale, {
  views: Record<SalesView, string>;
  coverage: Record<"COMPLETE" | "PARTIAL" | "UNAVAILABLE", string>;
  dateFrom: string;
  dateTo: string;
  calculating: string;
  applyPeriod: string;
}>;

const reportErrors = new Map<string, Record<Locale, string>>([
  ["INVALID_REPORT_PERIOD", {
    uk: ukrainianCopy.enCheckBothDatesUpTo,
    en: englishCopy.enCheckBothDatesUpTo,
  }],
  ["SALESDRIVE_NOT_CONFIGURED", {
    uk: ukrainianCopy.enConfigureSalesDriveInSettings,
    en: englishCopy.enConfigureSalesDriveInSettings,
  }],
  ["SALES_IMPORT_NOT_READY", {
    uk: ukrainianCopy.enWaitForTheFirstOrder,
    en: englishCopy.enWaitForTheFirstOrder,
  }],
]);

const fallbackError = { uk: fallbackErrorUk, en: fallbackErrorEn };

export function salesReportErrorMessage(code: string, locale: Locale): string {
  return (reportErrors.get(code) ?? fallbackError)[locale];
}

const reasons: Record<string, [string, string]> = {
  IMPORT_QUARANTINED: [
    ukrainianCopy.iMPORTQUARANTINEDВІмпортіЄІзольованіЗамовлення,
    englishCopy.iMPORTQUARANTINEDImportContainsQuarantinedOrdersReview,
  ],
  INSUFFICIENT_HISTORY: [ukrainianCopy.iNSUFFICIENTHISTORYНедостатньоІсторії, englishCopy.iNSUFFICIENTHISTORY],
  MISSING_REVENUE: [ukrainianCopy.mISSINGREVENUEНеповнаВиручка, englishCopy.mISSINGREVENUEIncompleteRevenue],
  LY_NON_POSITIVE: [ukrainianCopy.lYNONPOSITIVELYНеДодатний, englishCopy.lYNONPOSITIVELYIsNotPositive],
  NORMALIZATION_REPLAY_REQUIRED: [
    ukrainianCopy.nORMALIZATIONREPLAYREQUIREDПотрібенПовторнийІмпортІсторії,
    englishCopy.nORMALIZATIONREPLAYREQUIREDHistoryReplayRequired,
  ],
  PROJECT_MAPPING_UNVERIFIED: [
    ukrainianCopy.pROJECTMAPPINGUNVERIFIEDНеПідтвердженоПолеПроєкту,
    englishCopy.pROJECTMAPPINGUNVERIFIEDProjectFieldUnverified,
  ],
  RETURN_DATE_UNAVAILABLE: [
    ukrainianCopy.rETURNDATEUNAVAILABLEНевідомаДатаПовернення,
    englishCopy.rETURNDATEUNAVAILABLE,
  ],
  PAYMENT_DATE_UNAVAILABLE: [
    ukrainianCopy.pAYMENTDATEUNAVAILABLEНевідомаДатаОплати,
    englishCopy.pAYMENTDATEUNAVAILABLE,
  ],
  INFERRED_PAYMENT_DATE: [
    ukrainianCopy.iNFERREDPAYMENTDATEВикористаноПогодженуРезервнуДату,
    englishCopy.iNFERREDPAYMENTDATEApprovedInferredSaleDate,
  ],
  PRODUCT_KIND_UNVERIFIED: [
    ukrainianCopy.pRODUCTKINDUNVERIFIEDНеПідтвердженоТипТовару,
    englishCopy.pRODUCTKINDUNVERIFIEDProductTypeUnverified,
  ],
  CURRENCY_UNVERIFIED: [ukrainianCopy.cURRENCYUNVERIFIEDНевідомаВалюта, englishCopy.cURRENCYUNVERIFIED],
  REVENUE_UNAVAILABLE: [ukrainianCopy.rEVENUEUNAVAILABLEНевідомийДохідРядка, englishCopy.rEVENUEUNAVAILABLELineRevenueUnavailable],
  SERVICE_PROFIT_UNVERIFIED: [
    ukrainianCopy.sERVICEPROFITUNVERIFIEDНеПогодженоПрибутокПослуг,
    englishCopy.sERVICEPROFITUNVERIFIEDServiceProfitTreatmentUnverified,
  ],
  OWNERSHIP_UNVERIFIED: [ukrainianCopy.oWNERSHIPUNVERIFIEDНевідомаВласність, englishCopy.oWNERSHIPUNVERIFIED],
  PREORDER_AMOUNT_UNAVAILABLE: [
    ukrainianCopy.pREORDERAMOUNTUNAVAILABLEНевідомаСумаПередзамовлення,
    englishCopy.pREORDERAMOUNTUNAVAILABLE,
  ],
  MISSING_COST: [ukrainianCopy.mISSINGCOSTНевідомаСобівартість, englishCopy.mISSINGCOSTCostUnavailable],
  COMMISSION_UNVERIFIED: [ukrainianCopy.cOMMISSIONUNVERIFIEDНевідомаКомісія, englishCopy.cOMMISSIONUNVERIFIEDCommissionUnavailable],
};

export function salesReportReason(code: string, uk: boolean): string {
  return reasons[code]?.[uk ? 0 : 1] ?? code;
}
