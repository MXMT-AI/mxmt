import type { ChipType } from "./calendar-types";
import { calendarMarketingCalendarCalendarChipTypesMessages as englishCopy } from "@/messages/en.json";
import { calendarMarketingCalendarCalendarChipTypesMessages as ukrainianCopy } from "@/messages/uk.json";

export const calendarChipTypes = {
  promo: {
    legend: { uk: ukrainianCopy.enPromo, en: englishCopy.enPromo },
    option: { uk: ukrainianCopy.enPromo2, en: englishCopy.enPromo2 },
    fill: "bg-accent-info/12",
    ink: "text-accent-info",
  },
  holiday: {
    legend: { uk: ukrainianCopy.enHoliday, en: englishCopy.enHoliday },
    option: { uk: ukrainianCopy.enHoliday2, en: englishCopy.enHoliday2 },
    fill: "bg-accent-purple/12",
    ink: "text-accent-purple",
  },
  sale: {
    legend: { uk: ukrainianCopy.enSale, en: englishCopy.enSale },
    option: { uk: ukrainianCopy.enSale, en: englishCopy.enSale },
    fill: "bg-accent-yellow/12",
    ink: "text-accent-yellow",
  },
  event: {
    legend: { uk: ukrainianCopy.enEvent, en: englishCopy.enEvent },
    option: { uk: ukrainianCopy.enCollectionLaunch, en: englishCopy.enCollectionLaunch },
    fill: "bg-accent-cyan/12",
    ink: "text-accent-cyan",
  },
  agent: {
    legend: { uk: ukrainianCopy.enAgentTip, en: englishCopy.enAgentTip },
    fill: "bg-accent-positive/12",
    ink: "text-accent-positive border-s-2 border-accent-positive",
  },
  warn: {
    legend: { uk: ukrainianCopy.enWarning, en: englishCopy.enWarning },
    option: { uk: ukrainianCopy.enWarning, en: englishCopy.enWarning },
    fill: "bg-accent-negative/12",
    ink: "text-accent-negative border-s-2 border-accent-danger",
  },
  stock: {
    legend: { uk: ukrainianCopy.enStock, en: englishCopy.enStock },
    option: { uk: ukrainianCopy.enStock, en: englishCopy.enStock },
    fill: "bg-accent-purple/12",
    ink: "text-accent-purple border-s-2 border-accent-purple",
  },
} satisfies Record<ChipType, {
  legend: { uk: string; en: string };
  option?: { uk: string; en: string };
  fill: string;
  ink: string;
}>;

export const calendarEventTypes = ["promo", "holiday", "sale", "event", "stock", "warn"] as const;
