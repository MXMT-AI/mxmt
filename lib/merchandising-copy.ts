import type { Lang } from "./translations";
import { merchandisingCopy as merchandisingCopyEn } from "@/messages/en.json";
import { merchandisingCopy as merchandisingCopyUk } from "@/messages/uk.json";
export const merchandisingCopy = { uk: merchandisingCopyUk, en: merchandisingCopyEn } satisfies Record<Lang, Record<string, string>>;
