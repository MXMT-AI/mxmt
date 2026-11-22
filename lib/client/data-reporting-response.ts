import { clientDataReportingResponseMessages as englishCopy } from "@/messages/en.json";
import { clientDataReportingResponseMessages as ukrainianCopy } from "@/messages/uk.json";

export async function responseMessage(response: Response, lang: "uk" | "en" = "en"): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  const payload = await response.json().catch(() => null) as
    | { error?: string | { message?: string }; message?: string; code?: string }
    | null;
  if (payload?.code === "RAW_IMPORT_IN_PROGRESS") return lang === "uk"
    ? ukrainianCopy.importIsRunningStatusUpdates
    : englishCopy.importIsRunningStatusUpdates;
  if (payload?.code === "RAW_IMPORT_EXPIRED") return lang === "uk"
    ? ukrainianCopy.theImportExpiredPreviousData
    : englishCopy.theImportExpiredPreviousData;
  if (typeof payload?.error === "string") return payload.error;
  if (payload?.error && typeof payload.error === "object" && payload.error.message) {
    return payload.error.message;
  }
  return payload?.message ?? fallback;
}
