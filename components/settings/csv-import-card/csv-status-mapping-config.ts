import type { StatusMappingConfig } from "../status-mapping-fields/status-mapping-fields";

export const csvStatusMappingConfig: StatusMappingConfig = {
  codePattern: "(0|[1-9][0-9]{0,8})",
  options: ["SALE", "RETURN", "CORRECTION", "PREORDER", "REFUSAL"].map(value => ({ value, uk: value, en: value })),
  newRowKind: "SALE",
};
