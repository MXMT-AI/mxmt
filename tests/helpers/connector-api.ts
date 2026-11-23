import { NextRequest } from "next/server";
import { vi } from "vitest";
import { signAccessToken } from "@/lib/auth";
import { connectorModels } from "./connector-models";
import { createScreenDb } from "./screen-db";

export function connectorApiRequest(url: string, additionalHeaders: Record<string, string> = {}) {
  return (method = "GET", body?: unknown) =>
    new NextRequest(url, {
      method,
      headers: { "Content-Type": "application/json", ...additionalHeaders },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
}

export async function loginConnectorApi(
  state: { cookie: string },
  role = "ADMIN",
  tenantId = "a",
) {
  state.cookie = await signAccessToken({ sub: "owner", tenantId, role });
}

export async function setupConnectorApi(
  state: { models: unknown },
  authVariable: "JWT_SECRET" | "JWT_ACCESS_SECRET",
  signingSecret: string,
) {
  vi.stubEnv(authVariable, signingSecret);
  vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));
  const fixture = await createScreenDb();
  state.models = {
    ...connectorModels(fixture.db),
    $transaction: <T>(callback: (models: ReturnType<typeof connectorModels>) => Promise<T>) =>
      fixture.db.$transaction((tx) => callback(connectorModels(tx))),
  };
  return fixture;
}
