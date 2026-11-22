import { ShieldCheck, AlertTriangle } from "lucide-react";
import { settingsDriveSyncCardDriveAccessModesMessages as englishCopy } from "@/messages/en.json";
import { settingsDriveSyncCardDriveAccessModesMessages as ukrainianCopy } from "@/messages/uk.json";

export const driveAccessModes = {
  service_account: {
    Icon: ShieldCheck,
    panelClassName: "bg-[#86efac]/8 border-[#86efac]/20",
    colorClassName: "text-[#86efac]",
    uk: {
      title: ukrainianCopy.titleServiceAccountРекомендовано,
      description: ukrainianCopy.descriptionПриватнийДоступЧерезКлючСервісного,
      detail: ukrainianCopy.detailТаблицяЦьогоКабінетуСервісний,
    },
    en: {
      title: englishCopy.titleServiceAccountRecommended,
      description: englishCopy.descriptionPrivateAccessViaServiceAccount,
      detail: englishCopy.detailThisCabinetSSpreadsheetPlatform,
    },
  },
  public_link: {
    Icon: AlertTriangle,
    panelClassName: "bg-accent-yellow/8 border-accent-yellow/30",
    colorClassName: "text-accent-yellow",
    uk: {
      title: ukrainianCopy.titleПублічнеПосиланняНеРекомендується,
      description: ukrainianCopy.descriptionФайлМаєБутиВідкритийДля,
      detail: ukrainianCopy.detailТаблицяЦьогоКабінетуДоступнаЗа,
    },
    en: {
      title: englishCopy.titlePublicLinkNotRecommended,
      description: englishCopy.descriptionTheFileMustBeShared,
      detail: englishCopy.detailThisCabinetSSpreadsheetIsAccessible,
    },
  },
};
