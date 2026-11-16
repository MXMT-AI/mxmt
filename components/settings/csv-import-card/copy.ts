export const csvResourceNames = {
  uk: {
    orders: "Рядки замовлень",
    products: "Товари",
    stock: "Датовані залишки",
    receipts: "Рядки приходів",
    statuses: "Назви статусів",
    channels: "Назви каналів",
  },
  en: {
    orders: "Order lines",
    products: "Products",
    stock: "Dated stock",
    receipts: "Receipt lines",
    statuses: "Status names",
    channels: "Channel names",
  },
};
export const rowErrorCopy: Record<string, [string, string]> = {
  DUPLICATE_ID: [
    "Повторений ідентифікатор. Залиште один рядок для цієї позиції.",
    "Duplicate identity. Keep one row for this line.",
  ],
  INVALID_DECIMAL: [
    "Використайте число з крапкою та до 4 десяткових знаків.",
    "Use a dot decimal with up to 4 fractional digits.",
  ],
  INVALID_DATE: [
    "Використайте YYYY-MM-DD або ISO UTC із Z.",
    "Use YYYY-MM-DD or an ISO UTC timestamp with Z.",
  ],
  REQUIRED_COLUMN: [
    "Зіставте обов’язкову колонку.",
    "Map the required column.",
  ],
  INVALID_HEADERS: [
    "Заголовки мають бути унікальними й непорожніми.",
    "Headers must be unique and non-empty.",
  ],
  INCONSISTENT_DOCUMENT: [
    "Усі рядки документа повинні мати однакові дати та статус.",
    "All document lines must share dates and status.",
  ],
  INVALID_ID: [
    "Використайте стабільний ID до 200 символів, без пробілів на краях.",
    "Use a stable ID up to 200 characters without surrounding whitespace.",
  ],
};
export const csvErrorCopy: Record<string, [string, string]> = {
  CSV_SELECT_SOURCE_FIRST: [
    "Спочатку виберіть CSV як джерело звітів вище.",
    "First select CSV as the reporting source above.",
  ],
  CSV_SETTINGS_CHANGED: [
    "Налаштування змінились. Створіть нову перевірку з новою версією мапінгу.",
    "Settings changed. Preview again with a new mapping revision.",
  ],
  CSV_EXPIRED: [
    "Термін перевірки минув. Завантажте пакет знову.",
    "The preview expired. Upload the packet again.",
  ],
  CSV_PREVIEW_LIMIT: [
    "Скасуйте зайві перевірки перед новим завантаженням.",
    "Cancel unused previews before uploading another packet.",
  ],
  CSV_TIMEZONE_IMMUTABLE: [
    "Використайте часовий пояс існуючого CSV-джерела.",
    "Use the existing CSV source timezone.",
  ],
};

export const csvImportCopy = {
  uk: {
    title: "Імпорт CSV",
    description: "Завантажте окремі файли, зіставте колонки та перевірте пакет перед активацією. Дані не зміняться до активації.",
    adminOnly: "CSV-файли завантажує й активує адміністратор.",
    formatHint: "UTF-8, до 256 КіБ на файл, 1 МіБ і 500 рядків на пакет. Числа: крапка, до 4 знаків після неї. Дати: YYYY-MM-DD; час зміни та спостереження: ISO UTC із Z. Порожня клітинка означає «невідомо», а не нуль.",
    approval: "Підтверджую колонки, валюту, дати, статуси, знижки, ціни за одиницю та повноту файлів. Власність брендів не визначається з CSV.",
    processing: "Обробка…",
    preview: "Перевірити пакет",
  },
  en: {
    title: "CSV import",
    description: "Upload separate files, map columns and preview the packet before activation. Data changes only on activation.",
    adminOnly: "An administrator uploads and activates CSV files.",
    formatHint: "UTF-8, up to 256 KiB per file, 1 MiB and 500 rows per packet. Decimals use a dot and up to 4 fractional digits. Dates: YYYY-MM-DD; update/observation timestamps: ISO UTC with Z. Empty means unknown, not zero.",
    approval: "I confirm the columns, currency, dates, statuses, discounts, unit prices and file completeness. Brand ownership is not inferred from CSV.",
    processing: "Processing…",
    preview: "Preview packet",
  },
};
