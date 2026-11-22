import { csvResourceNames as csvResourceNamesEn, settingsCsvImportCardCopyMessages as englishCopy, csvImportCopy as csvImportCopyEn } from "@/messages/en.json";
import { csvResourceNames as csvResourceNamesUk, settingsCsvImportCardCopyMessages as ukrainianCopy, csvImportCopy as csvImportCopyUk } from "@/messages/uk.json";

export const csvResourceNames = { uk: csvResourceNamesUk, en: csvResourceNamesEn };
export const rowErrorCopy: Record<string, [string, string]> = {
  DUPLICATE_ID: [
    ukrainianCopy.dUPLICATEIDПовторенийІдентифікаторЗалиштеОдинРядок,
    englishCopy.dUPLICATEID,
  ],
  INVALID_DECIMAL: [
    ukrainianCopy.iNVALIDDECIMALВикористайтеЧислоЗКрапкоюТа,
    englishCopy.iNVALIDDECIMALUseADotDecimalWith,
  ],
  INVALID_DATE: [
    ukrainianCopy.iNVALIDDATEВикористайтеYYYYMMDDАбоISOUTC,
    englishCopy.iNVALIDDATEUseYYYYMMDDOrAnISO,
  ],
  REQUIRED_COLUMN: [
    ukrainianCopy.rEQUIREDCOLUMNЗіставтеОбовЯзковуКолонку,
    englishCopy.rEQUIREDCOLUMNMapTheRequiredColumn,
  ],
  INVALID_HEADERS: [
    ukrainianCopy.iNVALIDHEADERSЗаголовкиМаютьБутиУнікальнимиЙ,
    englishCopy.iNVALIDHEADERSHeadersMustBeUniqueAnd,
  ],
  INCONSISTENT_DOCUMENT: [
    ukrainianCopy.iNCONSISTENTDOCUMENTУсіРядкиДокументаПовинніМати,
    englishCopy.iNCONSISTENTDOCUMENTAllDocumentLinesMustShare,
  ],
  INVALID_ID: [
    ukrainianCopy.iNVALIDIDВикористайтеСтабільнийIDДо200,
    englishCopy.iNVALIDIDUseAStableIDUp,
  ],
};
export const csvErrorCopy: Record<string, [string, string]> = {
  CSV_REPLACEMENT_REQUIRES_FULL_DATASET: [csvImportCopyUk.replacementRequiresFullDataset, csvImportCopyEn.replacementRequiresFullDataset],
  CSV_REPLACEMENT_REQUIRES_NEWER_DATE: [csvImportCopyUk.replacementRequiresNewerDate, csvImportCopyEn.replacementRequiresNewerDate],
  CSV_REPLACEMENT_BUSY: [csvImportCopyUk.replacementBusy, csvImportCopyEn.replacementBusy],
  CSV_SELECT_SOURCE_FIRST: [
    ukrainianCopy.cSVSELECTSOURCEFIRSTСпочаткуВиберітьCSVЯкДжерело,
    englishCopy.cSVSELECTSOURCEFIRSTFirstSelectCSVAsThe,
  ],
  CSV_SETTINGS_CHANGED: [
    ukrainianCopy.cSVSETTINGSCHANGEDНалаштуванняЗмінилисьСтворітьНовуПеревірку,
    englishCopy.cSVSETTINGSCHANGEDSettingsChangedPreviewAgainWith,
  ],
  CSV_EXPIRED: [
    ukrainianCopy.cSVEXPIREDТермінПеревіркиМинувЗавантажтеПакет,
    englishCopy.cSVEXPIREDThePreviewExpiredUploadThe,
  ],
  CSV_PREVIEW_LIMIT: [
    ukrainianCopy.cSVPREVIEWLIMITСкасуйтеЗайвіПеревіркиПередНовим,
    englishCopy.cSVPREVIEWLIMITCancelUnusedPreviewsBeforeUploading,
  ],
  CSV_TIMEZONE_IMMUTABLE: [
    ukrainianCopy.cSVTIMEZONEIMMUTABLEВикористайтеЧасовийПоясІснуючогоCSVДжерела,
    englishCopy.cSVTIMEZONEIMMUTABLEUseTheExistingCSVSource,
  ],
};

export const csvImportCopy = { uk: csvImportCopyUk, en: csvImportCopyEn };
