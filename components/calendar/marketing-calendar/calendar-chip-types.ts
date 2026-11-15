import type { ChipType } from "./calendar-types";

export const calendarChipTypes = {
  promo: {
    legend: { uk: "Акція/промо", en: "Promo" },
    option: { uk: "Акція / промо", en: "Promo" },
    fill: "bg-accent-info/12",
    ink: "text-accent-info",
  },
  holiday: {
    legend: { uk: "Свято", en: "Holiday" },
    option: { uk: "Свято / подія", en: "Holiday" },
    fill: "bg-accent-purple/12",
    ink: "text-accent-purple",
  },
  sale: {
    legend: { uk: "Розпродаж", en: "Sale" },
    option: { uk: "Розпродаж", en: "Sale" },
    fill: "bg-accent-yellow/12",
    ink: "text-accent-yellow",
  },
  event: {
    legend: { uk: "Подія", en: "Event" },
    option: { uk: "Колекція / launch", en: "Collection / launch" },
    fill: "bg-accent-cyan/12",
    ink: "text-accent-cyan",
  },
  agent: {
    legend: { uk: "Порада агента", en: "Agent tip" },
    fill: "bg-accent-positive/12",
    ink: "text-accent-positive border-s-2 border-accent-positive",
  },
  warn: {
    legend: { uk: "Попередження", en: "Warning" },
    option: { uk: "Попередження", en: "Warning" },
    fill: "bg-accent-negative/12",
    ink: "text-accent-negative border-s-2 border-accent-danger",
  },
  stock: {
    legend: { uk: "Закупівля", en: "Stock" },
    option: { uk: "Закупівля", en: "Stock" },
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
