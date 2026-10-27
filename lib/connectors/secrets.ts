import "server-only";
import type { ConnectorProvider } from "./contract";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(): Buffer {
  const value = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("CONNECTOR_STORAGE_UNAVAILABLE");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("CONNECTOR_STORAGE_UNAVAILABLE");
  return key;
}

function credentialContext(tenantId: string, provider: ConnectorProvider): Buffer {
  if (!["salesdrive", "keycrm", "horoshop", "shopify", "csv", "mock"].includes(provider))
    throw new Error("CONNECTOR_STORAGE_UNAVAILABLE");
  return Buffer.from(`connector:v1:${tenantId}:${provider}`);
}

/** Bind credentials to both tenant and provider; the default preserves existing SalesDrive ciphertext. */
export function encryptCredentials(value: unknown, tenantId: string, provider: ConnectorProvider = "salesdrive"): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce, { authTagLength: 16 });
  cipher.setAAD(credentialContext(tenantId, provider));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}

/** Decryption errors have a fixed message and never include ciphertext or keys. */
export function decryptCredentials(value: string, tenantId: string, provider: ConnectorProvider = "salesdrive"): unknown {
  try {
    const [version, nonce, tag, payload, extra] = value.split(".");
    if (version !== "v1" || !nonce || !tag || !payload || extra) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64"), { authTagLength: 16 });
    decipher.setAAD(credentialContext(tenantId, provider));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()]).toString("utf8"));
  } catch { throw new Error("CONNECTOR_STORAGE_UNAVAILABLE"); }
}
