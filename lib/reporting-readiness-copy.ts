import type { ReportingSourceChoice } from "./reporting-source-contract";
export type ReportingHelp = { message: string; href: string; action: string };
/** Shared, client-safe recovery instructions. Never show database/provider messages. */
export function reportingErrorHelp(
  code: string,
  lang: "uk" | "en",
): ReportingHelp {
  const uk = lang === "uk";
  const settings = {
    href: "/settings",
    action: uk ? "Відкрити налаштування" : "Open Settings",
  };
  const data = {
    href: "/data-reporting?provider=sheets",
    action: uk ? "Відкрити дані та звіти" : "Open Data & Reports",
  };
  if (
    [
      "SALESDRIVE_NOT_CONFIGURED",
      "CONNECTOR_SOURCE_NOT_FOUND",
      "SHEETS_SOURCE_SELECTION_REQUIRED",
    ].includes(code)
  )
    return {
      ...settings,
      message: uk
        ? "Джерело звітів не вибрано або воно недоступне. У налаштуваннях підключіть джерело та виберіть його для звітів."
        : "The reporting source is not selected or is unavailable. Connect a source in Settings and select it for reporting.",
    };
  if (code === "SHEETS_MAPPING_REQUIRED")
    return {
      ...settings,
      message: uk
        ? "Потрібно погодити зіставлення Google Sheets. Перевірте колонки, статуси, дати та одиниці сум у налаштуваннях."
        : "Google Sheets mapping needs approval. Review columns, statuses, dates and amount units in Settings.",
    };
  if (code === "SHEETS_IMPORT_REQUIRED")
    return {
      ...data,
      message: uk
        ? "Google Sheets ще не перенесено у MVP-звіти. Імпортуйте таблицю та натисніть «Оновити MVP-звіти». Самого перегляду вихідних вкладок недостатньо."
        : "Google Sheets has not been projected into MVP reports yet. Import the workbook and choose Refresh MVP reports. Viewing the raw tabs alone does not prepare report inputs.",
    };
  if (
    [
      "SALES_IMPORT_NOT_READY",
      "DAILY_IMPORT_NOT_READY",
      "CONNECTOR_CHECK_REQUIRED",
    ].includes(code)
  )
    return {
      ...settings,
      message: uk
        ? "Джерело ще не готове до звітів. Перевірте доступ і завершіть імпорт у налаштуваннях."
        : "The source is not ready for reporting. Check access and complete its import in Settings.",
    };
  if (
    [
      "SCREEN_SELECTION_MISMATCH",
      "CONNECTOR_SOURCE_CHANGED",
      "SOURCE_SELECTION_CHANGED",
    ].includes(code)
  )
    return {
      ...settings,
      message: uk
        ? "Вибір джерела або періоду змінився. Оновіть звіт, щоб отримати узгоджені показники."
        : "The source or period selection changed. Refresh the report to load consistent metrics.",
    };
  return {
    ...settings,
    message: uk
      ? "Не вдалося завантажити звіт. Повторіть запит; якщо помилка залишається, перевірте вибране джерело та прогрес імпорту в налаштуваннях."
      : "The report could not be loaded. Retry; if the error persists, check the selected source and import progress in Settings.",
  };
}
export function reportingSourceHelp(
  source: ReportingSourceChoice | undefined,
  lang: "uk" | "en",
): ReportingHelp {
  if (!source)
    return reportingErrorHelp("SHEETS_SOURCE_SELECTION_REQUIRED", lang);
  if (source.readiness === "MAPPING_REQUIRED")
    return reportingErrorHelp("SHEETS_MAPPING_REQUIRED", lang);
  if (source.readiness === "CONNECTION_CHECK_REQUIRED")
    return reportingErrorHelp("CONNECTOR_CHECK_REQUIRED", lang);
  if (source.readiness === "IMPORT_REQUIRED")
    return reportingErrorHelp(
      source.provider === "sheets"
        ? "SHEETS_IMPORT_REQUIRED"
        : "SALES_IMPORT_NOT_READY",
      lang,
    );
  return {
    message:
      lang === "uk"
        ? "Дані джерела готові до розрахунку. Повнота історії та доступність окремих показників перевіряються у звітах."
        : "Source inputs are ready for calculation. History completeness and individual metric availability are checked in reports.",
    href: "/overview",
    action: lang === "uk" ? "Відкрити Огляд" : "Open Overview",
  };
}
