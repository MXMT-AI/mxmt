import type { Lang } from "@/lib/translations";

export const reportingSourceStatusCopy = {
  uk: {
    label: "Стан джерела звітів",
    error: "Не вдалося перевірити джерело звітів.",
    retry: "Повторити перевірку",
    loading: "Перевіряємо джерело звітів…",
    source: "Джерело MVP-звітів: ",
    unselected: "не вибрано",
    tabs: "Вкладки Google Sheets / SalesDrive перемикають перегляд даних. Джерело для п’яти MVP-екранів вибирається окремо в налаштуваннях.",
  },
  en: {
    label: "Reporting source status",
    error: "Could not check the reporting source.",
    retry: "Retry source check",
    loading: "Checking reporting source…",
    source: "MVP reporting source: ",
    unselected: "not selected",
    tabs: "The Google Sheets / SalesDrive tabs switch data views. Select the source for the five MVP screens separately in Settings.",
  },
} satisfies Record<Lang, Record<string, string>>;
