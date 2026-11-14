export const demoSheetUrl = "https://docs.google.com/spreadsheets/d/19yKafilaFoTmn22bMIvUsYvxT65cLNPR3bKT3ri7OhY/edit";

export const sheetsColumns = {
  products: [
    ["productId / sku / name", "B / M / C"],
    ["brand / category / barcode", "J / I / L"],
    ["retailPrice / costPrice / quantity", "D / F / G"],
    ["observedAt / inTransit", "O / P"],
  ],
  orders: [
    ["orderId / lineId", "A / AE"],
    ["productId / sku", "X / Y"],
    ["statusId / channelId", "F / AG"],
    ["orderedAt / paidAt / returnedAt / updatedAt", "D / G / AF / E"],
    ["quantity / salesAmount / costAmount", "L / AB / AC"],
  ],
} as const;

export const sheetsCopy = {
  uk: {
    title: "Підключення Google Sheets",
    intro: "Таблиця з демоданими містить синтетичні дані магазину одягу. Для імпорту використовуються аркуші Product YML 2.0 і ZAVOD_API. Практичний період для перевірки звітів — 1–29 жовтня 2026 року.",
    open: "Відкрити таблицю з демоданими",
    steps: [
      { title: "Підключіть таблицю", text: "Увійдіть як адміністратор окремого тренувального кабінету. У «Налаштування → Загальне → Google Sheets цього кабінету» вставте посилання на таблицю з демоданими й натисніть «Зберегти підключення». Якщо таблиця закрита, її власник має надати сервісному акаунту MXMT доступ на читання." },
      { title: "Імпортуйте вихідні дані", text: "Відкрийте «Інші інструменти → Дані та звіти → Google Sheets». Звірте таблицю в полі «Наступний імпорт» і натисніть «Імпортувати». Для першого запуску достатньо, щоб вихідні таблиці збереглися. Основні звіти готуються після погодження зіставлення." },
      { title: "Перевірте й погодьте зіставлення", text: "Поверніться в «Налаштування → Загальне → Google Sheets · зіставлення даних», виберіть імпортовану таблицю й звірте колонки з таблицями нижче. Задайте правила для валюти, сум, статусів, каналів і типів товарів. Натисніть «Перевірити зіставлення», перегляньте помилки й натисніть «Погодити цю версію»." },
      { title: "Виберіть джерело й оновіть звіти", text: "У «Джерело звітів» виберіть погоджене Google Sheets і натисніть «Використовувати для звітів». Поверніться в «Дані та звіти → Google Sheets» і натисніть «Оновити MVP-звіти»." },
      { title: "Звірте жовтневий зріз", text: "Відкрийте звіт за 01.10.2026–29.10.2026 із залишками на 29.10.2026 та всіма каналами. Контрольні підсумки таблиці з демоданими — 918 571 грн виручки і 4 224 одиниці на складі. Для переоцінки й дозамовлення перевірте, чи підтверджені власність, надходження й умови постачальників." },
    ],
    mapping: "Колонки й правила таблиці з демоданими",
    field: "Поле MXMT",
    column: "Колонка",
    rules: [
      "Валюта UAH, часовий пояс Europe/Kyiv. Сума продажу — за рядок після знижки, собівартість — за рядок. Для товарних категорій виберіть «Товар».",
      "Статуси: 5 → SALE, 7 → RETURN, 6 → REFUSAL, 33 → PREORDER.",
      "Канали: 38 → Інтернет-магазин, 68 → Маркетплейс, 78 → Шоурум Київ, 79 → Instagram.",
    ],
    settings: "Відкрити налаштування",
    reporting: "Відкрити імпорт Google Sheets",
    report: "Відкрити жовтневий звіт",
  },
  en: {
    title: "Connect Google Sheets",
    intro: "The demo workbook contains synthetic fashion retail data. The import uses Product YML 2.0 and ZAVOD_API. Use 1–29 October 2026 to check the reports.",
    open: "Open the demo spreadsheet",
    steps: [
      { title: "Connect the spreadsheet", text: "Sign in as an administrator in a separate training workspace. Under Settings → General → This cabinet’s Google Sheets, paste the demo spreadsheet link and select Save connection. For a restricted spreadsheet, its owner needs to give the MXMT service account read access." },
      { title: "Import the source data", text: "Open Other tools → Data & Reports → Google Sheets. Confirm the spreadsheet under Next import and select Import. The first import saves the source tables. The main reports are prepared after the mapping is approved." },
      { title: "Review and approve the mapping", text: "Return to Settings → General → Google Sheets · data mapping and choose the imported spreadsheet. Check the columns below and set the rules for currency, amounts, statuses, channels and product types. Preview the mapping, review errors and select Approve this revision." },
      { title: "Select the source and refresh reports", text: "In Reporting source, select the approved Google Sheets connection and click Use for reports. Return to Data & Reports → Google Sheets and select Refresh MVP reports." },
      { title: "Check the October snapshot", text: "Open the report for 1–29 October 2026 with stock dated 29 October and all channels selected. The workbook’s control totals are UAH 918,571 in revenue and 4,224 units in stock. For repricing and reordering, check that ownership, receipts and supplier terms are verified." },
    ],
    mapping: "Demo spreadsheet columns and rules",
    field: "MXMT field",
    column: "Column",
    rules: [
      "Use UAH and Europe/Kyiv. Map the sales amount to the net line amount and cost to line cost. Set the product categories to Merchandise.",
      "Statuses: 5 → SALE, 7 → RETURN, 6 → REFUSAL, 33 → PREORDER.",
      "Channels: 38 → Online store, 68 → Marketplace, 78 → Kyiv showroom, 79 → Instagram.",
    ],
    settings: "Open settings",
    reporting: "Open Google Sheets import",
    report: "Open the October report",
  },
};
