import type { CsvFileInput, CsvOptions } from "@/lib/connectors/csv/schema";

export interface CsvPreview {
  id: string;
  sourceId: string;
  contentHash: string;
  state: string;
  expiresAt: string;
  preview: {
    counts: Record<string, number>;
    errors: Array<{
      resource: string;
      row: number;
      code: string;
      field?: string;
    }>;
    warnings: string[];
  };
  job?: { state: string; errorCode: string | null } | null;
  options?: CsvOptions;
  mappings?: Array<Pick<CsvFileInput, "resource" | "delimiter" | "columns">>;
}
export interface CsvFileDraft {
  file: CsvFileInput;
  headers: string[];
  name: string;
}
export type CsvPacketAction = "activate" | "cancel" | "retry" | "process";
export interface CsvChannelRow { code: string; name: string }
