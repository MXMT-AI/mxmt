export async function responseMessage(response: Response, lang: "uk" | "en" = "en"): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  const payload = await response.json().catch(() => null) as
    | { error?: string | { message?: string }; message?: string; code?: string }
    | null;
  if (payload?.code === "RAW_IMPORT_IN_PROGRESS") return lang === "uk"
    ? "Імпорт ще виконується. Стан оновлюється автоматично. Якщо запуск перервався, через 10 хвилин від його початку можна повторити імпорт."
    : "Import is running. Status updates automatically. An interrupted run can be retried 10 minutes after it started.";
  if (payload?.code === "RAW_IMPORT_EXPIRED") return lang === "uk"
    ? "Час імпорту вичерпано. Попередні дані збережені. Запустіть імпорт знову."
    : "The import expired. Previous data is retained. Start the import again.";
  if (typeof payload?.error === "string") return payload.error;
  if (payload?.error && typeof payload.error === "object" && payload.error.message) {
    return payload.error.message;
  }
  return payload?.message ?? fallback;
}
