export type ReportingSourceProvider =
  | "sheets" | "salesdrive" | "keycrm" | "horoshop" | "shopify" | "csv";
export type ReportingSourceReadiness =
  | "CONNECTION_CHECK_REQUIRED" | "MAPPING_REQUIRED" | "IMPORT_REQUIRED" | "READY";
export interface ReportingSourceChoice {
  sourceId:string;
  provider:ReportingSourceProvider;
  accountHost:string;
  revision:number;
  lastCheck:unknown;
  readiness:ReportingSourceReadiness;
  selectable:boolean;
}
export interface ReportingSources {
  sourceId:string|null;
  revision:number;
  connections:ReportingSourceChoice[];
}
