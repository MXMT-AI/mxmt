export const importStateLabels: Record<"uk" | "en", Record<string, string>> = {
  uk: {
    PENDING: "У черзі",
    RUNNING: "Імпортується",
    RETRY: "Очікує повтору",
    PAUSED: "Призупинено",
    FAILED: "Помилка",
    COMPLETE: "Завершено",
  },
  en: {
    PENDING: "Queued",
    RUNNING: "Importing",
    RETRY: "Waiting to retry",
    PAUSED: "Paused",
    FAILED: "Failed",
    COMPLETE: "Complete",
  },
};

const issueLabels: Record<string, [string, string]> = {
  NEGATIVE_SOURCE_STOCK: [
    "Negative source stock is retained as a data-quality exception; inventory values are unavailable.",
    "Від’ємний залишок збережено як помилку якості даних; вартість залишку недоступна.",
  ],
  NEGATIVE_MOVEMENT_QUANTITY: [
    "A movement has a negative quantity; it does not establish a purchase cohort or cost.",
    "Рух має від’ємну кількість; він не визначає когорту закупівлі чи собівартість.",
  ],
  STALE_CATALOG_OBSERVATION: [
    "An older feed observation was skipped; newer catalogue data is retained.",
    "Старіше спостереження пропущено; новіші дані каталогу збережено.",
  ],
  HISTORICAL_STOCK_UNAVAILABLE: [
    "Earlier stock cannot be reconstructed from a current feed. Only recorded observations are available.",
    "З поточного файлу неможливо відновити минулі залишки. Доступні лише зафіксовані спостереження.",
  ],
  RECEIPT_POSTING_UNVERIFIED: [
    "Verify receipt posting statuses and supplier mapping before using purchase cost.",
    "Перевірте статуси проведення й відповідність постачальників перед використанням закупівельної ціни.",
  ],
  RECEIPT_DATE_UNAVAILABLE: [
    "Some receipt dates are missing or invalid.",
    "Деякі дати надходжень відсутні або некоректні.",
  ],
  INVALID_RECEIPT_LINE: [
    "Some receipts have invalid quantities or costs and were skipped. Correct them in SalesDrive and import again.",
    "Деякі надходження містять некоректні кількості або собівартість і пропущені. Виправте їх у SalesDrive й повторіть імпорт.",
  ],
  RECEIPTS_NOT_CONFIGURED: [
    "A receipts read key is not configured. Purchase cost coverage is incomplete.",
    "Ключ читання надходжень не налаштовано. Покриття закупівельної собівартості неповне.",
  ],
  DERIVED_RECEIPT_LINE_IDENTITY: [
    "Receipt line identity is derived; current document lines are replaced together.",
    "ID рядків надходжень похідні; поточні рядки документа оновлюються разом.",
  ],
  RECEIPT_VERSION_CONFLICT: [
    "Conflicting receipt versions were retained for review.",
    "Суперечливі версії надходження збережено для перевірки.",
  ],
  STOCK_QUANTITY_UNAVAILABLE: [
    "Some stock quantities are unknown; they are not treated as zero.",
    "Деякі залишки невідомі; вони не прирівнюються до нуля.",
  ],
  RETAIL_PRICE_UNAVAILABLE: [
    "Some retail prices are unavailable.",
    "Деякі роздрібні ціни недоступні.",
  ],
  CURRENCY_UNVERIFIED: [
    "Verify the feed currency before combining monetary values.",
    "Перевірте валюту файлу перед об’єднанням грошових значень.",
  ],
  MISSING_SOURCE_SKU: [
    "Some products have no article; their source ID is retained as a derived catalogue identity.",
    "Деякі товари не мають артикула; ID джерела збережено як похідний ідентифікатор каталогу.",
  ],
  STATUS_MAPPING_UNVERIFIED: [
    "Verify which source statuses count as sales and returns.",
    "Перевірте відповідність статусів продажам і поверненням.",
  ],
  CHANNEL_MAPPING_UNVERIFIED: [
    "Verify source channel IDs and names.",
    "Перевірте ідентифікатори та назви каналів.",
  ],
  CHANNEL_METADATA_UNVERIFIED: [
    "Channel metadata needs account verification.",
    "Довідник каналів потребує перевірки для цього акаунта.",
  ],
  DERIVED_LINE_IDENTITY: [
    "The source has no stable line IDs; current order lines are replaced together.",
    "Джерело не надає стабільних ID рядків; поточні рядки замовлення оновлюються разом.",
  ],
  REVENUE_MAPPING_UNVERIFIED: [
    "Revenue is unavailable until price and discount rules are verified.",
    "Виручка недоступна, доки не перевірено правила ціни та знижок.",
  ],
  COST_UNVERIFIED: [
    "Cost is unavailable or its mapping is unverified.",
    "Собівартість недоступна або її відповідність не перевірена.",
  ],
  RETURN_DATE_UNAVAILABLE: [
    "The source does not supply the return date.",
    "Джерело не надає дату повернення.",
  ],
  PAYMENT_DATE_UNAVAILABLE: [
    "A paid order has no usable payment date.",
    "Оплачене замовлення не має коректної дати оплати.",
  ],
  PAYMENT_DATE_PRECISION: [
    "Payment dates have day precision; an exact time is unavailable.",
    "Дата оплати має точність до дня; точний час невідомий.",
  ],
  INVALID_SOURCE_DATE: [
    "A source date is invalid or ambiguous in its timezone.",
    "Дата джерела некоректна або неоднозначна в його часовому поясі.",
  ],
  SKU_ALIAS_UNRESOLVED: [
    "Some products are not linked to the tenant catalogue yet.",
    "Деякі товари ще не пов’язані з каталогом компанії.",
  ],
  SKU_ALIAS_CONFLICT: [
    "Product identifiers point to different catalogue items.",
    "Ідентифікатори товару вказують на різні позиції каталогу.",
  ],
  SOURCE_PAGINATION_NOT_SNAPSHOT: [
    "SalesDrive pages are not a frozen snapshot. Reconcile against the account before activation.",
    "Сторінки SalesDrive не є незмінним знімком. Звірте дані з акаунтом перед активацією.",
  ],
  ORDER_VERSION_CONFLICT: [
    "Conflicting order versions were retained for review.",
    "Суперечливі версії замовлення збережено для перевірки.",
  ],
  INVALID_QUANTITY: [
    "Some quantities are invalid; affected orders need review.",
    "Деякі кількості некоректні; відповідні замовлення потребують перевірки.",
  ],
  DUPLICATE_SOURCE_LINE_ID: [
    "An order contains duplicate source line IDs.",
    "Замовлення містить повторені ID рядків джерела.",
  ],
  AMOUNT_OVERFLOW: [
    "An amount exceeds supported precision.",
    "Сума перевищує підтримувану точність.",
  ],
};

export function issueLabel(code: string, uk: boolean, generic = false) {
  if(generic&&code==="SOURCE_PAGINATION_NOT_SNAPSHOT")return uk?"Сторінки джерела можуть змінюватися під час читання. Звірте дані перед активацією.":"Source pages may change while reading. Reconcile the account before activation.";
  if(generic&&code==="INVALID_RECEIPT_LINE")return uk?"Некоректні надходження пропущено. Виправте кількості або собівартість у джерелі й повторіть імпорт.":"Invalid receipts were skipped. Correct quantities or costs in the source and import again.";
  return (
    issueLabels[code]?.[uk ? 1 : 0] ??
    (uk ? "Дані потребують перевірки." : "Source data needs review.")
  );
}

const errorLabels: Record<string, [string, string]> = {
  RATE_LIMITED: [
    "The account request limit was reached. The import will retry automatically.",
    "Досягнуто ліміту запитів акаунта. Імпорт повториться автоматично.",
  ],
  AUTH_FAILED: [
    "Check the saved SalesDrive read key, then resume.",
    "Перевірте збережений ключ читання SalesDrive, потім відновіть імпорт.",
  ],
  NOT_CONFIGURED: [
    "Save a SalesDrive connection, then resume.",
    "Збережіть з’єднання SalesDrive, потім відновіть імпорт.",
  ],
  CONNECTOR_CONFIG_CHANGED: [
    "The connection changed. Check it, then resume.",
    "З’єднання змінилося. Перевірте його, потім відновіть імпорт.",
  ],
  TIMEOUT: [
    "SalesDrive did not respond in time. The import will retry.",
    "SalesDrive не відповів вчасно. Імпорт повториться.",
  ],
  NETWORK_ERROR: [
    "SalesDrive is temporarily unavailable. The import will retry.",
    "SalesDrive тимчасово недоступний. Імпорт повториться.",
  ],
  INVALID_RESPONSE: [
    "SalesDrive returned an unexpected response. Check the account before resuming.",
    "SalesDrive повернув неочікувану відповідь. Перевірте акаунт перед відновленням.",
  ],
};

export function errorLabel(code: string, uk: boolean, generic = false) {
  if(generic&&["AUTH_FAILED","NOT_CONFIGURED","CONNECTOR_PROVIDER_UNAVAILABLE","CONNECTOR_BUDGET_UNVERIFIED"].includes(code))return uk?"Завершіть налаштування з’єднання й перевірте доступ перед відновленням.":"Complete connection setup and check access before resuming.";
  if(generic&&["TIMEOUT","NETWORK_ERROR","INVALID_RESPONSE"].includes(code))return uk?"Джерело не надало коректної відповіді. Перевірте доступ і повторіть імпорт.":"The source did not return a valid response. Check access and retry the import.";
  return (
    errorLabels[code]?.[uk ? 1 : 0] ??
    (uk
      ? "Імпорт не завершено. Перевірте з’єднання та відновіть його."
      : "The import could not finish. Check the connection and resume.")
  );
}
