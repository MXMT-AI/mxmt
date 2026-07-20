import { NextRequest, NextResponse } from "next/server";

type LogLevel = "info" | "warn" | "error";

export interface RequestContext {
  requestId: string;
  route: string;
  method: string;
  path: string;
  startedAt: number;
}

type LogContext = Record<string, unknown>;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    };
  }

  return { message: String(error) };
}

function writeLog(level: LogLevel, message: string, context: LogContext = {}) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function createRequestContext(request: NextRequest, route: string): RequestContext {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  return {
    requestId,
    route,
    method: request.method,
    path: request.nextUrl.pathname,
    startedAt: Date.now(),
  };
}

export function logInfo(message: string, context?: LogContext) {
  writeLog("info", message, context);
}

export function logWarn(message: string, context?: LogContext) {
  writeLog("warn", message, context);
}

export function logError(message: string, error: unknown, context?: LogContext) {
  writeLog("error", message, {
    ...context,
    error: serializeError(error),
  });
}

export function requestLogContext(context: RequestContext, extra: LogContext = {}) {
  return {
    requestId: context.requestId,
    route: context.route,
    method: context.method,
    path: context.path,
    durationMs: Date.now() - context.startedAt,
    ...extra,
  };
}

export function withRequestId<T>(response: NextResponse<T>, requestId: string): NextResponse<T> {
  response.headers.set("x-request-id", requestId);
  return response;
}
