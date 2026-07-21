import { NextRequest, NextResponse } from "next/server";

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
  return apiError("Invalid request body", 400, "VALIDATION_ERROR", details, requestId);
}

export function serverError(message = "Internal server error", requestId?: string): NextResponse<ApiErrorBody> {
  return apiError(message, 500, "INTERNAL_SERVER_ERROR", undefined, requestId);
}

export async function parseJsonBody<T = unknown>(
  request: NextRequest,
  requestId?: string
): Promise<JsonParseResult<T>> {
  try {
    return { data: await request.json() as T, response: null };
  } catch {
    return {
      data: null,
      response: apiError("Malformed JSON body", 400, "INVALID_JSON", undefined, requestId),
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
    if (required) issues.push(`${field} is required`);
    return undefined;
  }

  if (typeof raw !== "string") {
    issues.push(`${field} must be a string`);
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed && required) {
    issues.push(`${field} is required`);
    return undefined;
  }

  if (options.maxLength && trimmed.length > options.maxLength) {
    issues.push(`${field} must be at most ${options.maxLength} characters`);
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
    if (required) issues.push(`${field} is required`);
    return undefined;
  }

  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed)) {
    issues.push(`${field} must be a number`);
    return undefined;
  }

  if (options.min !== undefined && parsed < options.min) {
    issues.push(`${field} must be greater than or equal to ${options.min}`);
  }

  if (options.max !== undefined && parsed > options.max) {
    issues.push(`${field} must be less than or equal to ${options.max}`);
  }

  return parsed;
}

export function optionalDate(value: Record<string, unknown>, field: string, issues: string[]): Date | undefined {
  const raw = value[field];
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") {
    issues.push(`${field} must be an ISO date string`);
    return undefined;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    issues.push(`${field} must be a valid date`);
    return undefined;
  }

  return date;
}
