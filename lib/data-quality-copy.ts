import type { Lang } from "./translations";
/** Shared labels and corrective guidance for catalog groups and import lineage warnings. */
const issues: Record<string, [string, string, string, string]> = {
  CATALOG_LEGACY_SKU_COLLISION: [
    "Legacy SKU collision", "Збіг із legacy-SKU",
    "The existing Sheets identity and its history are retained separately from a legacy SKU. Review both records and their source identifiers before any manual reconciliation; importing again does not merge them.",
    "Наявний запис Sheets та його історію збережено окремо від legacy-SKU. Перед ручним узгодженням перевірте обидва записи та їхні ідентифікатори джерела; повторний імпорт їх не об’єднує.",
  ],
  PRODUCT_KIND_UNVERIFIED: [
    "Unverified product type", "Тип товару не підтверджено",
    "These movements are excluded from headline sales and stock classification. Approve category types in the source mapping or verify individual SKU types in Data Quality, then refresh reports.",
    "Ці рухи не входять до основних продажів і класифікації стоку. Погодьте типи категорій у зіставленні джерела або тип окремого SKU в Якості даних, потім оновіть звіти.",
  ],
  STOCK_QUANTITY_UNAVAILABLE: [
    "Unknown stock", "Невідомий залишок",
    "The catalogue is present but a verified dated stock observation is missing. Approve the observation policy against source evidence and import a current observation; do not relabel an old import as current.",
    "Каталог є, але немає підтвердженого датованого залишку. Погодьте правило спостереження за даними джерела й імпортуйте поточний залишок; старий імпорт не можна позначати поточним.",
  ],
  MISSING_BRAND: [
    "Missing brand",
    "Не заповнено бренд",
    "Brand totals and repricing need an identified brand. Correct the catalog brand or its alias, then import the catalog again.",
    "Для підсумків бренду й уцінки потрібен бренд. Виправте бренд або його аліас і повторіть імпорт каталогу.",
  ],
  MISSING_CATEGORY: [
    "Missing category",
    "Не заповнено категорію",
    "Category totals and seasonal rules need a category. Correct the source catalog and import it again.",
    "Для підсумків і сезонності потрібна категорія. Виправте каталог джерела й повторіть імпорт.",
  ],
  MISSING_COST: [
    "Missing or invalid cost",
    "Немає коректної собівартості",
    "Stock value, own-stock profit and export coverage remain incomplete. Verify purchase cost in the source and import again.",
    "Вартість залишку, прибуток власного стоку й експорт неповні. Перевірте закупівельну ціну в джерелі й повторіть імпорт.",
  ],
  ZERO_PRICE_WITH_STOCK: [
    "Zero price with stock",
    "Нульова ціна при залишку",
    "Repricing excludes these rows. Correct the retail price in the source, then refresh stock.",
    "Ці рядки виключено з уцінки. Виправте роздрібну ціну в джерелі й оновіть залишки.",
  ],
  OWNERSHIP_UNKNOWN: [
    "Unknown ownership",
    "Невідома власність",
    "Profit coverage and purchase recommendations need verified ownership. Configure the brand or SKU in Merchandising.",
    "Для прибутку й закупівель потрібна власність. Налаштуйте бренд або SKU в Мерчандайзингу.",
  ],
  COMMISSION_UNKNOWN: [
    "Unknown commission",
    "Невідома комісія",
    "Consignment profit is unavailable until the approved commission is configured.",
    "Прибуток реалізації недоступний без погодженої комісії.",
  ],
  SUPPLIER_UNKNOWN: [
    "Missing supplier",
    "Немає постачальника",
    "Supplier exports need a stable supplier. Configure the SKU override or brand default.",
    "Для експорту потрібен постачальник. Налаштуйте його для SKU або бренду.",
  ],
  SUPPLIER_TERMS_UNVERIFIED: [
    "Unverified supplier terms",
    "Умови постачальника не підтверджені",
    "Client defaults can support a preview; verify supplier purchase terms before final export.",
    "Попередній розрахунок використовує типові значення клієнта. Підтвердьте умови перед експортом.",
  ],
  SUPPLIER_LEAD_TIME_MISSING: [
    "Missing supplier lead time",
    "Немає плеча постачальника",
    "The approved client lead time is used as a fallback. Set supplier terms when known.",
    "Використовується погоджене типове плече клієнта. Уточніть умови постачальника.",
  ],
  IN_TRANSIT_UNKNOWN: [
    "Unknown stock in transit",
    "Невідомий товар у дорозі",
    "Final reordering needs verified transit or explicit user confirmation, including a confirmed zero.",
    "Для дозамовлення потрібна перевірена кількість у дорозі або явне підтвердження, зокрема нуля.",
  ],
  SKU_ALIAS_UNRESOLVED: [
    "Unmatched sale SKU",
    "SKU продажу не знайдено",
    "This line cannot enter SKU metrics. Correct product identifiers in the source and replay order history.",
    "Рядок не входить до метрик SKU. Виправте ідентифікатори джерела й повторіть історичний імпорт.",
  ],
};
const other: Record<string, [string, string]> = {
  INVALID_SOURCE_DATE: ["Invalid source date", "Некоректна дата джерела"],
  BRAND_IDENTITY_CONFLICT: ["Ambiguous brand", "Неоднозначний бренд"],
  MISSING_PRICE: ["Missing retail price", "Немає роздрібної ціни"],
  MISSING_RECEIPT_DATE: ["Missing receipt date", "Немає дати надходження"],
  NEGATIVE_STOCK: ["Negative stock", "Від’ємний залишок"],
  NEGATIVE_PRODUCT_AGE: ["Invalid receipt date", "Некоректна дата надходження"],
  PRODUCT_KIND_UNVERIFIED: [
    "Unverified product type",
    "Тип товару не підтверджено",
  ],
  STOCK_QUANTITY_UNAVAILABLE: ["Unknown stock", "Невідомий залишок"],
  NEGATIVE_METRIC: ["Negative metric", "Від’ємна метрика"],
  EXCLUDED_CHANNEL: ["Excluded channel", "Виключений канал"],
  EXCLUDED_PROJECT: ["Excluded project", "Виключений проєкт"],
  PROJECT_MAPPING_UNVERIFIED: [
    "Unverified project mapping",
    "Поле проєкту не підтверджено",
  ],
  SIGNED_CORRECTION: ["Signed correction", "Підписане коригування"],
  RETURN_DATE_UNAVAILABLE: ["Unknown return date", "Невідома дата повернення"],
  INFERRED_PAYMENT_DATE: ["Inferred sale date", "Припущена дата продажу"],
};
/** Localize known diagnostics while retaining unknown source codes for investigation. */
export const qualityLabel = (code: string, lang: Lang) =>
  issues[code]?.[lang === "uk" ? 1 : 0] ??
  other[code]?.[lang === "uk" ? 1 : 0] ??
  code;
/** Explain coverage impact and the correction needed without inventing missing values. */
export const qualityGuidance = (code: string, lang: Lang) =>
  issues[code]?.[lang === "uk" ? 3 : 2] ??
  (lang === "uk"
    ? "Перевірте походження рядка, виправте дані джерела й повторіть імпорт. Невідомі дані не замінюються нулями."
    : "Review row lineage, correct source data and import again. Unknown values are not replaced with zero.");
/** Route policy exceptions to Merchandising and source exceptions to the connection settings. */
export const qualityFixHref = (code: string) =>
  [
    "OWNERSHIP_UNKNOWN",
    "COMMISSION_UNKNOWN",
    "SUPPLIER_UNKNOWN",
    "SUPPLIER_TERMS_UNVERIFIED",
    "SUPPLIER_LEAD_TIME_MISSING",
  ].includes(code)
    ? "/settings?tab=merchandising"
    : "/settings?tab=general#data-quality-title";
