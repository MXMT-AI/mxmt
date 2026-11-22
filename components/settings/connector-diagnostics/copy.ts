import type { ResourceCheck } from "@/lib/connectors/contract";
import { diagnosticsCopy as diagnosticsCopyEn } from "@/messages/en.json";
import { diagnosticsCopy as diagnosticsCopyUk } from "@/messages/uk.json";

type DiagnosticsCopy = {
  metadata: string;
  unsupported: string;
  incomplete: string;
  resources: Record<ResourceCheck["resource"], string>;
};

export const diagnosticsCopy = { uk: diagnosticsCopyUk, en: diagnosticsCopyEn } satisfies Record<"uk" | "en", DiagnosticsCopy>;
