import type { Lang } from "@/lib/translations";

const labels: Record<string, [string, string]> = {
  productId: ["ID товару", "Product ID"],
  sku: ["Артикул", "SKU"],
  name: ["Назва", "Name"],
  brand: ["Бренд", "Brand"],
  category: ["Категорія", "Category"],
  barcode: ["Штрихкод", "Barcode"],
  retailPrice: ["Роздрібна ціна", "Retail price"],
  costPrice: ["Собівартість одиниці", "Unit cost"],
  quantity: ["Кількість", "Quantity"],
  inTransit: ["У дорозі", "In transit"],
  observedAt: ["Час спостереження залишку", "Stock observation time"],
  orderId: ["ID замовлення", "Order ID"],
  lineId: ["ID рядка замовлення", "Order line ID"],
  statusId: ["Статус", "Status"],
  channelId: ["Канал", "Channel"],
  orderedAt: ["Час замовлення", "Order time"],
  paidAt: ["Дата оплати", "Payment date"],
  returnedAt: ["Дата повернення", "Return date"],
  updatedAt: ["Час зміни", "Update time"],
  salesAmount: ["Сума продажу", "Sales amount"],
  costAmount: ["Собівартість продажу", "Sales cost"],
  UNKNOWN: ["Не підтверджено", "Unverified"],
  SALE: ["Продаж", "Sale"],
  RETURN: ["Повернення", "Return"],
  CORRECTION: ["Коригування", "Correction"],
  PREORDER: ["Передзамовлення", "Preorder"],
  REFUSAL: ["Відмова", "Refusal"],
  MERCHANDISE: ["Товар", "Merchandise"],
  SERVICE: ["Послуга", "Service"],
  GIFT_CARD: ["Подарунковий сертифікат", "Gift card"],
};
const errors: Record<string, [string, string]> = {
  INVALID_SHEETS_MAPPING: [
    "Перевірте валюту, обов’язкові поля, дати подій та одиниці сум.",
    "Check currency, required fields, event dates and amount units.",
  ],
  SHEETS_RAW_IMPORT_REQUIRED: [
    "Спочатку успішно імпортуйте таблицю в «Дані та звіти».",
    "Import the workbook successfully in Data & Reports first.",
  ],
  SHEETS_RAW_IMPORT_CHANGED: [
    "Імпорт змінився. Завантажте зіставлення знову.",
    "The import changed. Reload the mapping.",
  ],
  SHEETS_MAPPING_REVISION_CONFLICT: [
    "Є новіша версія. Завантажте зіставлення знову.",
    "A newer revision exists. Reload the mapping.",
  ],
  SHEETS_MAPPING_PREVIEW_EXPIRED: [
    "Термін preview минув. Перевірте зіставлення ще раз.",
    "The preview expired. Preview the mapping again.",
  ],
  SHEETS_MAPPING_HAS_BLOCKING_ERRORS: [
    "Спочатку усуньте блокувальні помилки.",
    "Resolve blocking errors before approval.",
  ],
};
export function mappingCaption(key: string, lang: Lang) {
  return labels[key]?.[lang === "uk" ? 0 : 1] ?? key;
}

export function mappingError(body: Record<string, unknown>, lang: Lang) {
  return errors[String(body.code)]?.[lang === "uk" ? 0 : 1] ?? (lang === "uk"
    ? "Не вдалося обробити зіставлення. Перевірте джерело та спробуйте ще раз."
    : "Could not process mapping. Check the source and retry.");
}
