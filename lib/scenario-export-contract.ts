export type ExportKind = "reprice" | "reorder";
export interface ExportFileMetadata {
  id: string;
  name: string;
  sha256: string;
  byteLength: number;
  rowCount: number;
  supplierId: string | null;
  currency: string;
  url: string;
}
export interface ScenarioExportReceipt {
  exportId: string;
  actionId: string;
  kind: ExportKind;
  previewId: string;
  createdAt: string;
  actorId: string;
  files: ExportFileMetadata[];
}
export interface ScenarioExportCommand {
  exportId: string;
  kind: ExportKind;
  previewId: string;
  scenario: object;
  target?: { supplierId: string; currency: string };
}
export const SCENARIO_EXPORT_VERSION = 1;
