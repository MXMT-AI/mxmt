import type { Locale } from "@/i18n/routing";
import type { SalesView } from "@/lib/sales-report-view";

export const salesWorkspaceCopy = {
  uk: {
    views: { articles: "SKU", brands: "Бренди", categories: "Категорії", channels: "Канали" },
    coverage: { COMPLETE: "Повне", PARTIAL: "Часткове", UNAVAILABLE: "Недоступне" },
    dateFrom: "Дата від",
    dateTo: "Дата до",
    calculating: "Розрахунок…",
    applyPeriod: "Застосувати період",
  },
  en: {
    views: { articles: "SKUs", brands: "Brands", categories: "Categories", channels: "Channels" },
    coverage: { COMPLETE: "Complete", PARTIAL: "Partial", UNAVAILABLE: "Unavailable" },
    dateFrom: "Date from",
    dateTo: "Date to",
    calculating: "Calculating…",
    applyPeriod: "Apply period",
  },
} satisfies Record<Locale, {
  views: Record<SalesView, string>;
  coverage: Record<"COMPLETE" | "PARTIAL" | "UNAVAILABLE", string>;
  dateFrom: string;
  dateTo: string;
  calculating: string;
  applyPeriod: string;
}>;

const reportErrors = new Map<string, Record<Locale, string>>([
  ["INVALID_REPORT_PERIOD", {
    uk: "Перевірте обидві дати: період до 366 днів, без майбутніх дат.",
    en: "Check both dates: up to 366 days, without future dates.",
  }],
  ["SALESDRIVE_NOT_CONFIGURED", {
    uk: "Налаштуйте SalesDrive у налаштуваннях.",
    en: "Configure SalesDrive in Settings.",
  }],
  ["SALES_IMPORT_NOT_READY", {
    uk: "Дочекайтесь завершення першого імпорту замовлень.",
    en: "Wait for the first order import to finish.",
  }],
]);

const fallbackError = {
  uk: "Не вдалося завантажити звіт. Повторіть після синхронізації.",
  en: "Could not load the report. Retry after synchronization.",
};

export function salesReportErrorMessage(code: string, locale: Locale): string {
  return (reportErrors.get(code) ?? fallbackError)[locale];
}

const reasons: Record<string, [string, string]> = {
  IMPORT_QUARANTINED: [
    "В імпорті є ізольовані замовлення: перевірте якість даних",
    "Import contains quarantined orders: review data quality",
  ],
  INSUFFICIENT_HISTORY: ["Недостатньо історії", "Insufficient history"],
  MISSING_REVENUE: ["Неповна виручка", "Incomplete revenue"],
  LY_NON_POSITIVE: ["LY не додатний", "LY is not positive"],
  NORMALIZATION_REPLAY_REQUIRED: [
    "Потрібен повторний імпорт історії",
    "History replay required",
  ],
  PROJECT_MAPPING_UNVERIFIED: [
    "Не підтверджено поле проєкту",
    "Project field unverified",
  ],
  RETURN_DATE_UNAVAILABLE: [
    "Невідома дата повернення",
    "Return date unavailable",
  ],
  PAYMENT_DATE_UNAVAILABLE: [
    "Невідома дата оплати",
    "Payment date unavailable",
  ],
  INFERRED_PAYMENT_DATE: [
    "Використано погоджену резервну дату",
    "Approved inferred sale date",
  ],
  PRODUCT_KIND_UNVERIFIED: [
    "Не підтверджено тип товару",
    "Product type unverified",
  ],
  CURRENCY_UNVERIFIED: ["Невідома валюта", "Currency unverified"],
  REVENUE_UNAVAILABLE: ["Невідомий дохід рядка", "Line revenue unavailable"],
  SERVICE_PROFIT_UNVERIFIED: [
    "Не погоджено прибуток послуг",
    "Service profit treatment unverified",
  ],
  OWNERSHIP_UNVERIFIED: ["Невідома власність", "Ownership unverified"],
  PREORDER_AMOUNT_UNAVAILABLE: [
    "Невідома сума передзамовлення",
    "Preorder amount unavailable",
  ],
  MISSING_COST: ["Невідома собівартість", "Cost unavailable"],
  COMMISSION_UNVERIFIED: ["Невідома комісія", "Commission unavailable"],
};

export function salesReportReason(code: string, uk: boolean): string {
  return reasons[code]?.[uk ? 0 : 1] ?? code;
}
