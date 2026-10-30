import type { CheckCode } from "./contract";
export function connectorCheckLabels(
  lang: "uk" | "en",
): Record<CheckCode, string> {
  const uk = lang === "uk";
  return {
    OK: uk ? "Доступ є" : "Access confirmed",
    NOT_CONFIGURED: uk ? "Не налаштовано" : "Not configured",
    AUTH_FAILED: uk
      ? "Перевірте ключ і права читання"
      : "Check the key and read permissions",
    RATE_LIMITED: uk
      ? "Ліміт запитів. Повторіть пізніше"
      : "Rate limit reached. Retry later",
    TIMEOUT: uk ? "Час очікування вичерпано" : "Connection timed out",
    NETWORK_ERROR: uk ? "Не вдалося підключитися" : "Could not connect",
    INVALID_RESPONSE: uk
      ? "Відповідь джерела потребує перевірки"
      : "Source response needs verification",
    RESPONSE_TOO_LARGE: uk
      ? "Відповідь перевищує розмір перевірки"
      : "Response exceeds the check size limit",
  };
}
