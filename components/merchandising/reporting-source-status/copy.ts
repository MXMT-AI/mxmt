import type { Lang } from "@/lib/translations";
import { reportingSourceStatusCopy as reportingSourceStatusCopyEn } from "@/messages/en.json";
import { reportingSourceStatusCopy as reportingSourceStatusCopyUk } from "@/messages/uk.json";

export const reportingSourceStatusCopy = { uk: reportingSourceStatusCopyUk, en: reportingSourceStatusCopyEn } satisfies Record<Lang, Record<string, string>>;
