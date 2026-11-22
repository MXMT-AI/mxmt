import { stockCopy as stockCopyEn } from "@/messages/en.json";
import { stockCopy as stockCopyUk } from "@/messages/uk.json";

export const stockCopy = { uk: stockCopyUk, en: stockCopyEn };
export type StockCopy = typeof stockCopy.en;
