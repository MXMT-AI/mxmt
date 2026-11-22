import type { Lang } from "@/lib/translations";
import { reportReadinessCopy as reportReadinessCopyEn } from "@/messages/en.json";
import { reportReadinessCopy as reportReadinessCopyUk } from "@/messages/uk.json";

export const reportReadinessCopy = { uk: reportReadinessCopyUk, en: reportReadinessCopyEn } satisfies Record<Lang, Record<string, string>>;
