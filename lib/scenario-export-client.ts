import type { ExportKind } from "./scenario-export-contract";
import { exportCopy as exportCopyEn, scenarioExportClientMessages as englishCopy } from "@/messages/en.json";
import { exportCopy as exportCopyUk, scenarioExportClientMessages as ukrainianCopy } from "@/messages/uk.json";
export class ExportAttempt {
  private pending = new Map<string, string>();
  id(key: string, create: () => string) {
    let id = this.pending.get(key);
    if (id === undefined) {
      id = create();
      this.pending.set(key, id);
    }
    return id;
  }
  complete(key: string) {
    this.pending.delete(key);
  }
}
export const exportCopy = { en: exportCopyEn, uk: exportCopyUk } as const;
export type ExportCopy = (typeof exportCopy)["en"] | (typeof exportCopy)["uk"];
export const exportKindLabel = (kind: ExportKind, lang: "uk" | "en") =>
  kind === "reprice"
    ? lang === "uk"
      ? ukrainianCopy.exportKindLabelRepricing
      : englishCopy.exportKindLabelRepricing
    : lang === "uk"
      ? ukrainianCopy.exportKindLabelReordering
      : englishCopy.exportKindLabelReordering;
