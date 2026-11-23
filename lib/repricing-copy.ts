import { commonActions } from "@/i18n/common-actions";
import { repricingCopy as repricingCopyEn } from "@/messages/en.json";
import { repricingCopy as repricingCopyUk } from "@/messages/uk.json";

export const repricingCopy = {
  en: { ...repricingCopyEn, retry: commonActions.en.retry },
  uk: { ...repricingCopyUk, retry: commonActions.uk.retry },
} as const;
export type RepricingCopy =
  | (typeof repricingCopy)["en"]
  | (typeof repricingCopy)["uk"];
