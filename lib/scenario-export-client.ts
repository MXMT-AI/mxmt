import type { ExportKind } from "./scenario-export-contract";
/** Reuse the same idempotency key after an uncertain response; a completed click starts a new export. */
export class ExportAttempt {
  private pending: { key: string; id: string } | null = null;
  id(key: string, create: () => string) {
    if (this.pending?.key !== key) this.pending = { key, id: create() };
    return this.pending.id;
  }
  complete(key: string) {
    if (this.pending?.key === key) this.pending = null;
  }
}
export const exportCopy = {
  en: {
    exporting: "Preparing CSV…",
    prepared: "CSV files are ready. Choose a file to download.",
    earlier: "Files were prepared for the earlier scenario.",
    history: "Recent exports",
    empty: "No exports recorded yet.",
    download: "Download CSV",
    files: "Files",
    actor: "Actor",
    rows: "rows",
    readOnly: "Export requires Analyst access. Preview remains available.",
    note: "Exports use the validated selected snapshot and record an action. No CRM prices or supplier orders are changed.",
    error: "Could not prepare the export. Please retry.",
    notReady: "Correct missing data or invalid selected rows before exporting.",
    changed:
      "The preview changed. Wait for the current preview and export again.",
    conflict:
      "The export request conflicts with a previous request. Refresh the page and try again.",
    historyError: "Could not load export history.",
    retry: "Retry",
    previous: "Previous",
    next: "Next",
    page: "Page",
  },
  uk: {
    exporting: "Підготовка CSV…",
    prepared: "CSV готові. Оберіть файл для завантаження.",
    earlier: "Файли підготовлено для попереднього сценарію.",
    history: "Останні експорти",
    empty: "Експортів ще немає.",
    download: "Завантажити CSV",
    files: "Файли",
    actor: "Користувач",
    rows: "рядків",
    readOnly:
      "Для експорту потрібна роль аналітика. Перегляд розрахунку доступний.",
    note: "Експорт використовує перевірений обраний знімок і записує дію в історію. Ціни CRM та замовлення постачальникам не змінюються.",
    error: "Не вдалося підготувати експорт. Спробуйте ще раз.",
    notReady:
      "Виправте відсутні дані або некоректні обрані рядки перед експортом.",
    changed:
      "Розрахунок змінився. Дочекайтеся актуального preview та повторіть експорт.",
    conflict:
      "Запит експорту конфліктує з попереднім запитом. Оновіть сторінку та спробуйте ще раз.",
    historyError: "Не вдалося завантажити історію експорту.",
    retry: "Повторити",
    previous: "Назад",
    next: "Далі",
    page: "Сторінка",
  },
} as const;
export type ExportCopy = (typeof exportCopy)["en"] | (typeof exportCopy)["uk"];
export const exportKindLabel = (kind: ExportKind, lang: "uk" | "en") =>
  kind === "reprice"
    ? lang === "uk"
      ? "Переоцінка"
      : "Repricing"
    : lang === "uk"
      ? "Дозамовлення"
      : "Reordering";
