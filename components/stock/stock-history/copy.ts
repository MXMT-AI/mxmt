import type { Lang } from "@/lib/translations";

export const stockHistoryCopy = {
  uk: {
    empty: "Потрібно 30 послідовних днів спостережень",
    body: "Щоденні залишки зберігаються з дня підключення. Пропущені дні та неповні дані не замінюються нулями.",
    basis: "Ті самі SKU, що у вибраному знімку та фільтрах. Значення — фактичні спостереження в останній календарний день місяця, не баланс о 23:59. Канали продажів не змінюють склад.",
    cost: "За собівартістю",
    month: "Дата",
    current: "Останні 12 місяців",
    ly: "Рік тому",
    qty: "Кількість",
    dates: "Час спостережень",
    none: "Немає підтвердженого спостереження",
    chart: "Спостереження вартості стоку за місяцями",
    table: "Точні значення та повнота історії",
    coverage: "SKU зі спостереженнями"
  },
  en: {
    empty: "30 consecutive observation days required",
    body: "Daily stock is retained from connection onward. Missing days and incomplete evidence are not replaced with zeroes.",
    basis: "The same SKUs as the selected snapshot and filters. Values are actual observations on the last calendar date of each month, not a 23:59 closing balance. Sales channels do not change stock.",
    cost: "At cost",
    month: "Date",
    current: "Latest 12 months",
    ly: "Prior year",
    qty: "Quantity",
    dates: "Observation times",
    none: "No verified observation",
    chart: "Monthly observed stock cost",
    table: "Exact values and history coverage",
    coverage: "Observed SKUs"
  },
};

export type StockHistoryCopy = typeof stockHistoryCopy[Lang];
