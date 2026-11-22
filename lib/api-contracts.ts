import { NextRequest, NextResponse } from "next/server";
import { formatMessage } from "@/i18n/format-message";
import { apiContractsMessages as englishApiMessages } from "@/messages/en.json";

export interface ApiErrorBody {
  error: string;
  code: string;
  details?: string[];
  requestId?: string;
}

export type JsonParseResult<T> =
  | { data: T; response: null }
  | { data: null; response: NextResponse<ApiErrorBody> };

export function apiError(
  message: string,
  status = 400,
  code = "BAD_REQUEST",
  details?: string[],
  requestId?: string
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      error: message,
      code,
      ...(details && details.length > 0 ? { details } : {}),
      ...(requestId ? { requestId } : {}),
    },
    { status }
  );
}

export function validationError(details: string[], requestId?: string): NextResponse<ApiErrorBody> {
  return apiError(englishApiMessages.invalidRequestBody, 400, "VALIDATION_ERROR", details, requestId);
}

export function serverError(message = englishApiMessages.internalServerError, requestId?: string): NextResponse<ApiErrorBody> {
  return apiError(message, 500, "INTERNAL_SERVER_ERROR", undefined, requestId);
}

export async function parseJsonBody<T = unknown>(
  request: NextRequest,
  requestId?: string,
  maxBytes?: number,
  parser?: (body: string) => unknown
): Promise<JsonParseResult<T>> {
  try {
    if (maxBytes !== undefined) {
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            return { data: null, response: apiError(englishApiMessages.requestBodyIsTooLarge, 413, "BODY_TOO_LARGE", undefined, requestId) };
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return { data: (parser ?? JSON.parse)(new TextDecoder().decode(bytes)) as T, response: null };
    }
    return { data: (parser ? parser(await request.text()) : await request.json()) as T, response: null };
  } catch {
    return {
      data: null,
      response: apiError(englishApiMessages.malformedJSONBody, 400, "INVALID_JSON", undefined, requestId),
    };
  }
}

export async function parseOptionalJsonBody<T = unknown>(
  request: NextRequest,
  fallback = {} as T,
  requestId?: string
): Promise<JsonParseResult<T>> {
  try {
    const raw = await request.text();
    return { data: raw.trim() ? JSON.parse(raw) as T : fallback, response: null };
  } catch {
    return {
      data: null,
      response: apiError(englishApiMessages.malformedJSONBody, 400, "INVALID_JSON", undefined, requestId),
    };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringField(
  value: Record<string, unknown>,
  field: string,
  issues: string[],
  options: { required?: boolean; maxLength?: number } = {}
): string | undefined {
  const raw = value[field];
  const required = options.required ?? false;

  if (raw === undefined || raw === null || raw === "") {
    if (required) issues.push(formatMessage(englishApiMessages.required, { field }));
    return undefined;
  }

  if (typeof raw !== "string") {
    issues.push(formatMessage(englishApiMessages.mustBeString, { field }));
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed && required) {
    issues.push(formatMessage(englishApiMessages.required, { field }));
    return undefined;
  }

  if (options.maxLength && trimmed.length > options.maxLength) {
    issues.push(formatMessage(englishApiMessages.maximumLength, { field, maximum: options.maxLength }));
  }

  return trimmed;
}

export function numberField(
  value: Record<string, unknown>,
  field: string,
  issues: string[],
  options: { required?: boolean; min?: number; max?: number } = {}
): number | undefined {
  const raw = value[field];
  const required = options.required ?? false;

  if (raw === undefined || raw === null || raw === "") {
    if (required) issues.push(formatMessage(englishApiMessages.required, { field }));
    return undefined;
  }

  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed)) {
    issues.push(formatMessage(englishApiMessages.mustBeNumber, { field }));
    return undefined;
  }

  if (options.min !== undefined && parsed < options.min) {
    issues.push(formatMessage(englishApiMessages.minimumValue, { field, minimum: options.min }));
  }

  if (options.max !== undefined && parsed > options.max) {
    issues.push(formatMessage(englishApiMessages.maximumValue, { field, maximum: options.max }));
  }

  return parsed;
}

export function optionalDate(value: Record<string, unknown>, field: string, issues: string[]): Date | undefined {
  const raw = value[field];
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") {
    issues.push(formatMessage(englishApiMessages.isoDateString, { field }));
    return undefined;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    issues.push(formatMessage(englishApiMessages.validDate, { field }));
    return undefined;
  }

  return date;
}
