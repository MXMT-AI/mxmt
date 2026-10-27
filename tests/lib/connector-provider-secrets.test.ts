import { createCipheriv } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  encryptCredentials,
  decryptCredentials,
} from "@/lib/connectors/secrets";
import type { ConnectorProvider } from "@/lib/connectors/contract";
const key = Buffer.alloc(32, 7);
beforeEach(() =>
  vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", key.toString("base64")),
);
afterEach(() => vi.unstubAllEnvs());

it.each(["salesdrive", "keycrm", "horoshop", "shopify", "csv"] as const)(
  "isolates %s credentials from every other provider and tenant",
  (provider) => {
    const value = { token: "synthetic-secret" };
    const encrypted = encryptCredentials(value, "client-a", provider);
    expect(decryptCredentials(encrypted, "client-a", provider)).toEqual(value);
    expect(encrypted).not.toContain(value.token);
    expect(encryptCredentials(value, "client-a", provider)).not.toBe(encrypted);
    expect(() => decryptCredentials(encrypted, "client-b", provider)).toThrow(
      "CONNECTOR_STORAGE_UNAVAILABLE",
    );
    for (const other of [
      "salesdrive",
      "keycrm",
      "horoshop",
      "shopify",
      "csv",
    ] as const) {
      if (other !== provider)
        expect(() => decryptCredentials(encrypted, "client-a", other)).toThrow(
          "CONNECTOR_STORAGE_UNAVAILABLE",
        );
    }
  },
);

it("reads the pre-v2 SalesDrive encryption envelope unchanged", () => {
  const nonce = Buffer.alloc(12, 8);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, {
    authTagLength: 16,
  });
  // Independently build the exact old AAD/envelope rather than using the updated writer.
  cipher.setAAD(Buffer.from("connector:v1:client-a:salesdrive"));
  const payload = Buffer.concat([
    cipher.update('{"ordersApiKey":"old-synthetic-key"}'),
    cipher.final(),
  ]);
  const old = [
    "v1",
    nonce.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    payload.toString("base64"),
  ].join(".");
  expect(decryptCredentials(old, "client-a")).toEqual({
    ordersApiKey: "old-synthetic-key",
  });
  expect(
    decryptCredentials(
      encryptCredentials({ key: "new" }, "client-a"),
      "client-a",
      "salesdrive",
    ),
  ).toEqual({ key: "new" });
});

it("rejects unknown runtime providers and tampered envelopes with sanitized errors", () => {
  const invalid = "arbitrary:provider" as ConnectorProvider;
  expect(() =>
    encryptCredentials({ token: "private" }, "client-a", invalid),
  ).toThrow("CONNECTOR_STORAGE_UNAVAILABLE");
  const encrypted = encryptCredentials(
    { token: "private" },
    "client-a",
    "keycrm",
  );
  expect(() => decryptCredentials(encrypted, "client-a", invalid)).toThrow(
    "CONNECTOR_STORAGE_UNAVAILABLE",
  );
  const parts = encrypted.split(".");
  const bytes = Buffer.from(parts[3], "base64");
  bytes[0] ^= 1;
  parts[3] = bytes.toString("base64");
  expect(() =>
    decryptCredentials(parts.join("."), "client-a", "keycrm"),
  ).toThrow("CONNECTOR_STORAGE_UNAVAILABLE");
});
