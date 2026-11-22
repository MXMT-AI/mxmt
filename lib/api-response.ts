import { formatMessage } from "@/i18n/format-message";
import { apiResponseMessages as ukrainianCopy } from "@/messages/uk.json";

export async function readApiJson<T extends Record<string, unknown>>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      error: response.ok
        ? ukrainianCopy.errorСерверПовернувНекоректнуВідповідь
        : formatMessage(ukrainianCopy.errorЗапитЗавершивсяЗПомилкоюHTTP, { status: response.status }),
    } as unknown as T;
  }
}
