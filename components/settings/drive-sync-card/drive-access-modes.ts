import { ShieldCheck, AlertTriangle } from "lucide-react";

export const driveAccessModes = {
  service_account: {
    Icon: ShieldCheck,
    panelClassName: "bg-[#86efac]/8 border-[#86efac]/20",
    colorClassName: "text-[#86efac]",
    uk: {
      title: "Service Account (рекомендовано)",
      description: "Приватний доступ через ключ сервісного акаунту. Файл може залишатись закритим. Доступ лише на читання — файл у Drive не змінюється.",
      detail: "Таблиця цього кабінету + сервісний акаунт платформи",
    },
    en: {
      title: "Service Account (recommended)",
      description: "Private access via service account key. File can stay private. Read-only — the Drive file is never modified.",
      detail: "This cabinet’s spreadsheet + platform service account",
    },
  },
  public_link: {
    Icon: AlertTriangle,
    panelClassName: "bg-accent-yellow/8 border-accent-yellow/30",
    colorClassName: "text-accent-yellow",
    uk: {
      title: "Публічне посилання (не рекомендується)",
      description: "Файл має бути відкритий для всіх за посиланням. Дані доступні будь-кому з посиланням. Доступ лише на читання — файл у Drive не змінюється.",
      detail: "Таблиця цього кабінету доступна за посиланням",
    },
    en: {
      title: "Public link (not recommended)",
      description: "The file must be shared with anyone who has the link. Data is accessible to anyone with the link. Read-only — the Drive file is never modified.",
      detail: "This cabinet’s spreadsheet is accessible by link",
    },
  },
};
