import { apiFetch } from "@/lib/fetch";
import type { Locale } from "@/i18n/routing";
import { responseMessage } from "./data-reporting-response";

export async function postDataReportingAction(
  path: "/api/data/import" | "/api/data/calculate",
  body: Record<string, unknown>,
  locale: Locale,
): Promise<unknown> {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 504 || response.status === 408) {
      throw new Error(locale === "uk"
        ? `Сервер перевищив час очікування. Перевірте стан операції перед повтором (HTTP ${response.status}).`
        : `The server timed out. Check the operation status before retrying (HTTP ${response.status}).`);
    }
    throw new Error(await responseMessage(response, locale));
  }
  return response.json();
}
