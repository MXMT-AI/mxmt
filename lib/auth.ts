import { SignJWT, jwtVerify } from "jose";

function getJwtSecret(envName: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET", fallback: string): Uint8Array {
  const value = process.env[envName];

  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`${envName} is required in production`);
  }

  return new TextEncoder().encode(value ?? fallback);
}

const ACCESS_SECRET = getJwtSecret("JWT_ACCESS_SECRET", "dev-access-secret-change-in-production");
const REFRESH_SECRET = getJwtSecret("JWT_REFRESH_SECRET", "dev-refresh-secret-change-in-production");

export interface TokenPayload {
  sub: string;      // userId
  tenantId: string;
  role: string;
  type: "access" | "refresh";
}

// ─── Sign ─────────────────────────────────────────────────────────────────────

export async function signAccessToken(
  payload: Omit<TokenPayload, "type">
): Promise<string> {
  return new SignJWT({ ...payload, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(ACCESS_SECRET);
}

export async function signRefreshToken(
  payload: Omit<TokenPayload, "type">
): Promise<string> {
  return new SignJWT({ ...payload, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(REFRESH_SECRET);
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, ACCESS_SECRET);
  return payload as unknown as TokenPayload;
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, REFRESH_SECRET);
  return payload as unknown as TokenPayload;
}
