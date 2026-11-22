import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SqlDatabase } from "./connectors/database";
import {
  configuredReportStorage,
  type ReportPublicationStorage,
} from "./merchandising-publication-storage";

type StoredFile = { compressed: string; revision: string };
type CachedFile = { file: StoredFile | null; expiresAt: number; size: number };
const files = new Map<string, CachedFile>();
const cacheBytes = 32 * 1024 * 1024;
let storedBytes = 0;

function remember(path: string, file: StoredFile | null) {
  const old = files.get(path);
  if (old) storedBytes -= old.size;
  files.delete(path);
  const size = file ? file.compressed.length * 2 : 0;
  if (size > cacheBytes) return;
  while (files.size >= 128 || storedBytes + size > cacheBytes) {
    const first = files.keys().next().value!;
    storedBytes -= files.get(first)!.size;
    files.delete(first);
  }
  files.set(path, {
    file, size,
    expiresAt: !file || path.endsWith("/active.json") ? Date.now() + 15_000 : Infinity,
  });
  storedBytes += size;
}

function encode(text: string): StoredFile {
  return {
    compressed: gzipSync(text).toString("base64"),
    revision: createHash("sha256").update(text).digest("hex"),
  };
}

export function databaseReportStorage(
  tenantId: string,
  db: SqlDatabase = prisma,
): ReportPublicationStorage {
  const prefix = `merchandising/v1/${createHash("sha256").update(tenantId).digest("hex")}/`;
  function storageKey(path: string) {
    if (!path.startsWith(prefix)) throw new Error("Report storage namespace mismatch");
    return `report-publication:${path}`;
  }
  return {
    async read(path) {
      const key = storageKey(path);
      const cached = db === prisma ? files.get(key) : undefined;
      let file: StoredFile | null;
      if (cached && cached.expiresAt > Date.now()) {
        file = cached.file;
        files.delete(key);
        files.set(key, cached);
      } else {
        try {
          const [row] = await db.$queryRaw<Array<{ values: StoredFile }>>(Prisma.sql`
            SELECT values FROM "MerchandisingConfig"
            WHERE "tenantId"=${tenantId} AND "configType"='GENERAL' AND key=${key} AND revision=1`);
          file = row?.values ?? null;
          if (db === prisma && files.get(key) === cached) remember(key, file);
        } catch (error) {
          if (!cached?.file) throw error;
          file = cached.file;
        }
      }
      return file && { text: gunzipSync(Buffer.from(file.compressed, "base64")).toString("utf8"), revision: file.revision };
    },
    async write(path, text) {
      const key = storageKey(path);
      const file = encode(text);
      await db.$executeRaw(Prisma.sql`
        INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values)
        VALUES (${randomUUID()},${tenantId},'GENERAL',${key},1,${JSON.stringify(file)}::jsonb)`);
      if (db === prisma) remember(key, file);
    },
    async publish(path, text, expected) {
      const key = storageKey(path);
      const file = encode(text);
      const value = JSON.stringify(file);
      const changed = expected === null
        ? await db.$executeRaw(Prisma.sql`
          INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values)
          VALUES (${randomUUID()},${tenantId},'GENERAL',${key},1,${value}::jsonb)
          ON CONFLICT ("tenantId","configType",key,revision) DO NOTHING`)
        : await db.$executeRaw(Prisma.sql`
          UPDATE "MerchandisingConfig" SET values=${value}::jsonb
          WHERE "tenantId"=${tenantId} AND "configType"='GENERAL' AND key=${key} AND revision=1
            AND values->>'revision'=${expected}`);
      if (db === prisma) {
        if (changed) remember(key, file);
        else {
          storedBytes -= files.get(key)?.size ?? 0;
          files.delete(key);
        }
      }
      return changed === 1;
    },
  };
}

export async function workspaceReportStorage(tenantId: string) {
  const configured = configuredReportStorage(tenantId);
  if (configured) return configured;
  const storage = databaseReportStorage(tenantId);
  const tenantHash = createHash("sha256").update(tenantId).digest("hex");
  const active = await storage.read(`merchandising/v1/${tenantHash}/active.json`);
  return active ? storage : null;
}
