import { settingsSheetsMappingPolicyFieldsPolicyFieldsMessages as englishCopy } from "@/messages/en.json";
import { settingsSheetsMappingPolicyFieldsPolicyFieldsMessages as ukrainianCopy } from "@/messages/uk.json";

export const policyFields = [
  {
    key: "salesAmount", uk: ukrainianCopy.enAmountAfterDiscounts, en: englishCopy.enAmountAfterDiscounts,
    options: [
      { value: "net_line", uk: ukrainianCopy.enLineTotal, en: englishCopy.enLineTotal },
      { value: "net_unit", uk: ukrainianCopy.enPerUnit, en: englishCopy.enPerUnit },
    ],
  },
  {
    key: "costAmount", uk: ukrainianCopy.enSalesCostBasis, en: englishCopy.enSalesCostBasis,
    options: [
      { value: "line", uk: ukrainianCopy.enLineTotal, en: englishCopy.enLineTotal },
      { value: "unit", uk: ukrainianCopy.enPerUnit, en: englishCopy.enPerUnit },
      { value: "unavailable", uk: ukrainianCopy.enUnverified, en: englishCopy.enUnverified },
    ],
  },
  {
    key: "lineIdentity", uk: ukrainianCopy.enOrderLineIdentity, en: englishCopy.enOrderLineIdentity,
    options: [
      { value: "column", uk: ukrainianCopy.enDedicatedLineIDColumn, en: englishCopy.enDedicatedLineIDColumn },
      { value: "order_product", uk: ukrainianCopy.enUniqueOrderProductPair, en: englishCopy.enUniqueOrderProductPair },
    ],
  },
  {
    key: "stockObservation", uk: ukrainianCopy.enStockObservationBasis, en: englishCopy.enStockObservationBasis,
    options: [
      { value: "unverified", uk: ukrainianCopy.enUnverified2, en: englishCopy.enUnverified2 },
      { value: "column", uk: ukrainianCopy.enTimestampColumn, en: englishCopy.enTimestampColumn },
      { value: "import_observation", uk: ukrainianCopy.enCurrentObservationDuringImport, en: englishCopy.enCurrentObservationDuringImport },
    ],
  },
  {
    key: "defaultProductKind", uk: ukrainianCopy.enDefaultProductKind, en: englishCopy.enDefaultProductKind,
    options: [
      { value: "UNKNOWN", uk: ukrainianCopy.enUnverified2, en: englishCopy.enUnverified2 },
      { value: "MERCHANDISE", uk: ukrainianCopy.enMerchandise, en: englishCopy.enMerchandise },
    ],
  },
] as const;
