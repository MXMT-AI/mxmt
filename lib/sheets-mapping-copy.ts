const copy: Record<string, [string, string]> = {
  MAPPING_DICTIONARY_LIMIT: [
    "Забагато статусів, каналів або категорій для однієї версії зіставлення",
    "Too many statuses, channels or categories for one mapping revision",
  ],
  PRODUCT_ID_MISSING: ["Немає ID товару", "Missing product ID"],
  PRODUCT_ID_DUPLICATE: ["Повторюється ID товару", "Duplicate product ID"],
  PRODUCT_NAME_MISSING: ["Немає назви товару", "Missing product name"],
  PRODUCT_SKU_AMBIGUOUS: [
    "Артикул відповідає кільком товарам",
    "SKU matches multiple products",
  ],
  STOCK_QUANTITY_INVALID: [
    "Залишок має некоректне значення",
    "Invalid stock quantity",
  ],
  PRODUCT_VALUE_UNAVAILABLE: [
    "Значення ціни або кількості потребує перевірки",
    "Price or quantity needs review",
  ],
  STOCK_OBSERVATION_UNVERIFIED: [
    "Час спостереження залишку не підтверджено",
    "Stock observation time is unverified",
  ],
  ORDER_ID_MISSING: ["Немає ID замовлення", "Missing order ID"],
  ORDER_PRODUCT_UNMATCHED: [
    "Не знайдено відповідний товар",
    "Product could not be matched",
  ],
  ORDER_PRODUCT_IDENTITY_CONFLICT: [
    "ID товару та артикул суперечать один одному",
    "Product ID and SKU conflict",
  ],
  ORDER_LINE_ID_MISSING: [
    "Немає стабільного ID рядка",
    "Missing stable line ID",
  ],
  ORDER_LINE_AMBIGUOUS: [
    "Рядок замовлення неоднозначний або повторюється",
    "Order line is ambiguous or duplicated",
  ],
  ORDER_STATUS_UNMAPPED: ["Статус не зіставлено", "Status is not mapped"],
  ORDER_QUANTITY_INVALID: [
    "Кількість у замовленні некоректна",
    "Invalid order quantity",
  ],
  ORDER_AMOUNT_INVALID: ["Сума продажу некоректна", "Invalid sales amount"],
  ORDER_COST_UNAVAILABLE: [
    "Собівартість не підтверджено",
    "Cost is unverified",
  ],
  SALE_DATE_UNVERIFIED: [
    "Дата оплати не підтверджена",
    "Payment date is unverified",
  ],
  CORRECTION_DATE_UNVERIFIED: [
    "Дата коригування не підтверджена",
    "Correction date is unverified",
  ],
  RETURN_DATE_UNVERIFIED: [
    "Дата повернення не підтверджена",
    "Return date is unverified",
  ],
  ORDER_CHANNEL_UNMAPPED: ["Канал не зіставлено", "Channel is not mapped"],
  DUPLICATE_PRODUCT_IDENTITIES: [
    "Потрібно усунути дублікати ID товарів",
    "Resolve duplicate product IDs",
  ],
  EMPTY_PRODUCT_SNAPSHOT: [
    "У вибраному імпорті немає товарів",
    "The selected import contains no products",
  ],
  AMBIGUOUS_ORDER_LINES_REQUIRE_QUARANTINE: [
    "Неоднозначні рядки потребують окремого розгляду",
    "Ambiguous lines need separate review",
  ],
  UNMAPPED_STATUSES_EXCLUDED: [
    "Непідтверджені статуси не потраплять у фінансові показники",
    "Unverified statuses will be excluded from financial metrics",
  ],
  PRODUCT_KIND_REVIEW_REQUIRED: [
    "Потрібно визначити типи позицій: товар, послуга чи сертифікат",
    "Classify merchandise, services and gift cards",
  ],
  STOCK_IS_IMPORT_OBSERVATION_NOT_HISTORICAL_CLOSE: [
    "Залишки спостерігаються під час імпорту; це не історичний залишок на кінець дня",
    "Stock is observed during import; this is not a historical closing balance",
  ],
  IN_TRANSIT_UNKNOWN: [
    "Кількість товарів у дорозі невідома",
    "In-transit quantity is unknown",
  ],
  HISTORY_COVERAGE_NOT_CONFIRMED: [
    "Повнота історії продажів не підтверджена",
    "Sales-history completeness is unverified",
  ],
  OWNERSHIP_AND_SUPPLIER_TERMS_REQUIRE_SETTINGS: [
    "Тип власності та умови постачальників потрібно підтвердити в налаштуваннях",
    "Confirm ownership and supplier terms in Settings",
  ],
  RECEIPT_EVIDENCE_NOT_IMPORTED: [
    "Підтверджені документи надходження ще не підключені",
    "Verified supplier receipts are not connected yet",
  ],
};
export const sheetsMappingMessage = (code: string, lang: "uk" | "en") =>
  copy[code]?.[lang === "uk" ? 0 : 1] ??
  (lang === "uk"
    ? "Потрібна додаткова перевірка даних"
    : "Additional data review is required");
