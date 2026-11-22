import { repricingCopy as repricingCopyEn } from "@/messages/en.json";
import { repricingCopy as repricingCopyUk } from "@/messages/uk.json";

export const repricingCopy = { en: repricingCopyEn, uk: repricingCopyUk } as const;
export type RepricingCopy =
  | (typeof repricingCopy)["en"]
  | (typeof repricingCopy)["uk"];
