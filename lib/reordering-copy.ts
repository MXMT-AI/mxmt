import { commonActions } from "@/i18n/common-actions";
import { reorderingCopy as reorderingCopyEn } from "@/messages/en.json";
import { reorderingCopy as reorderingCopyUk } from "@/messages/uk.json";

export const reorderingCopy = {
  en: { ...reorderingCopyEn, retry: commonActions.en.retry },
  uk: { ...reorderingCopyUk, retry: commonActions.uk.retry },
} as const;
export type ReorderingCopy =
  | (typeof reorderingCopy)["en"]
  | (typeof reorderingCopy)["uk"];
export function reorderingIssue(copy: ReorderingCopy, code: string) {
  return copy.issues[code as keyof typeof copy.issues] ?? copy.review;
}
