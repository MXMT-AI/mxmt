import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { compare } from "bcryptjs";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./auth";
import { prisma } from "./prisma";

const ACCESS_MAX_AGE = 15 * 60;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

type SessionIdentity = { sub: string; tenantId: string; role: string };
type CookieStore = Awaited<ReturnType<typeof cookies>>;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const storedSession = (id: string) => "session:v2:" + digest(id);

async function issueCookies(cookieStore: CookieStore, identity: SessionIdentity, sessionId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_MAX_AGE;
  const [access, refresh] = await Promise.all([
    signAccessToken(identity), signRefreshToken(identity, sessionId),
  ]);
  cookieStore.set("access_token", access, { ...cookieOptions, maxAge: ACCESS_MAX_AGE });
  cookieStore.set("refresh_token", refresh, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });
  cookieStore.set("access_token_exp", String(expiresAt), {
    ...cookieOptions, httpOnly: false, maxAge: REFRESH_MAX_AGE,
  });
}

export async function startSession(identity: SessionIdentity) {
  const sessionId = randomUUID();
  await prisma.user.update({
    where: { id: identity.sub },
    data: { refreshToken: storedSession(sessionId) },
  });
  await issueCookies(await cookies(), identity, sessionId);
}

async function readRefreshSession(cookieStore: CookieStore) {
  const token = cookieStore.get("refresh_token")?.value;
  if (!token) return { error: "NO_REFRESH_TOKEN" } as const;
  let payload;
  try {
    payload = await verifyRefreshToken(token);
  } catch {
    return { error: "INVALID_REFRESH_TOKEN" } as const;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user?.refreshToken) return { error: "SESSION_REVOKED" } as const;
  const sessionId = payload.jti ?? digest(token);
  const fingerprint = storedSession(sessionId);
  if (user.refreshToken !== fingerprint) {
    if (!user.refreshToken.startsWith("$2") || !(await compare(token, user.refreshToken))) {
      return { error: "REFRESH_TOKEN_MISMATCH" } as const;
    }
  }
  return {
    identity: { sub: user.id, tenantId: user.tenantId, role: user.role },
    sessionId, fingerprint, stored: user.refreshToken,
  };
}

export async function renewSession() {
  const cookieStore = await cookies();
  const session = await readRefreshSession(cookieStore);
  if (session.error) return session.error;
  if (session.stored !== session.fingerprint) {
    const migrated = await prisma.user.updateMany({
      where: { id: session.identity.sub, refreshToken: session.stored },
      data: { refreshToken: session.fingerprint },
    });
    if (migrated.count === 0) {
      const current = await prisma.user.findUnique({ where: { id: session.identity.sub } });
      if (current?.refreshToken !== session.fingerprint) return "SESSION_REVOKED";
    }
  }
  // Renew expiry without replacing the shared session ID when another tab refreshes.
  await issueCookies(cookieStore, session.identity, session.sessionId);
  return null;
}

export async function endSession() {
  const cookieStore = await cookies();
  const session = await readRefreshSession(cookieStore);
  if (!session.error) {
    await prisma.user.updateMany({
      where: { id: session.identity.sub, refreshToken: { in: [session.stored, session.fingerprint] } },
      data: { refreshToken: null },
    });
  }
  for (const name of ["access_token", "refresh_token", "access_token_exp"]) cookieStore.delete(name);
}
