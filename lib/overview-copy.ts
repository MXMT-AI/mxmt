import { overviewCopy as overviewCopyEn } from "@/messages/en.json";
import { overviewCopy as overviewCopyUk } from "@/messages/uk.json";

export const overviewCopy = { uk: overviewCopyUk, en: overviewCopyEn };
export type OverviewCopy = typeof overviewCopy.en;
