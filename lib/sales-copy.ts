import { salesCopy as salesCopyEn } from "@/messages/en.json";
import { salesCopy as salesCopyUk } from "@/messages/uk.json";

export const salesCopy = { uk: salesCopyUk, en: salesCopyEn };
export type SalesCopy = typeof salesCopy.en;
