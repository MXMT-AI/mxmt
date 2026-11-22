import type { Lang } from "@/lib/translations";
import { stockHistoryCopy as stockHistoryCopyEn } from "@/messages/en.json";
import { stockHistoryCopy as stockHistoryCopyUk } from "@/messages/uk.json";

export const stockHistoryCopy = { uk: stockHistoryCopyUk, en: stockHistoryCopyEn };

export type StockHistoryCopy = typeof stockHistoryCopy[Lang];
