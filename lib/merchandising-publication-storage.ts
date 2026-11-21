import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Redis } from "@upstash/redis";
import { get, put } from "@vercel/blob";

export type StoredReportFile = { text: string; revision: string };

export interface ReportPublicationStorage {
  read(path: string): Promise<StoredReportFile | null>;
  write(path: string, text: string): Promise<void>;
  publish(path: string, text: string, expected: string | null): Promise<boolean>;
  cache?: {
    read(path: string): Promise<string | null>;
    write(path: string, text: string): Promise<unknown>;
  };
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

function localRevision(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export function localReportStorage(directory: string): ReportPublicationStorage {
  return {
    async read(path) {
      try {
        const text = await readFile(join(directory, path), "utf8");
        return { text, revision: localRevision(text) };
      } catch (error) {
        if (!isMissing(error)) throw error;
        return null;
      }
    },
    async write(path, text) {
      const file = join(directory, path);
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      await writeFile(file, text, { flag: "wx", mode: 0o600 });
    },
    async publish(path, text, expected) {
      const file = join(directory, path);
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      // Local development uses one server process. Replace the pointer atomically.
      let current: string | null = null;
      try {
        current = localRevision(readFileSync(file, "utf8"));
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      if (current !== expected) return false;
      const temp = file + "." + randomUUID();
      try {
        writeFileSync(temp, text, { mode: 0o600, flag: "wx" });
        renameSync(temp, file);
      } finally {
        rmSync(temp, { force: true });
      }
      return true;
    },
  };
}

function blobReportStorage(token: string): ReportPublicationStorage {
  const options = { access: "private" as const, token };
  const read: ReportPublicationStorage["read"] = async (path) => {
    const result = await get(path, { ...options, useCache: false });
    if (result?.statusCode !== 200) return null;
    return {
      text: await new Response(result.stream).text(),
      revision: result.blob.etag,
    };
  };
  return {
    read,
    async write(path, text) {
      await put(path, text, { ...options, contentType: "application/json" });
    },
    async publish(path, text, expected) {
      try {
        await put(path, text, {
          ...options,
          contentType: "application/json",
          ...(expected === null ? {} : { ifMatch: expected }),
        });
        return true;
      } catch (error) {
        if ((await read(path))?.revision !== (expected ?? undefined)) return false;
        throw error;
      }
    },
  };
}

export function configuredReportStorage(tenantId: string): ReportPublicationStorage | null {
  if (!process.env.MERCHANDISING_PUBLISHED_TENANTS?.split(",")
    .some((id) => id.trim() === tenantId)) return null;

  const local = process.env.MERCHANDISING_PUBLICATION_DIR;
  const blobToken = process.env.MERCHANDISING_BLOB_READ_WRITE_TOKEN;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  let storage: ReportPublicationStorage;
  if (process.env.VERCEL !== "1" && local) {
    const fromPublic = relative(resolve("public"), local);
    if (!isAbsolute(local) || (fromPublic !== ".." && !fromPublic.startsWith(".." + sep)))
      throw new Error("Report publication storage must be an absolute path outside public/");
    storage = localReportStorage(local);
  } else if (blobToken) {
    storage = blobReportStorage(blobToken);
  } else {
    return null;
  }
  if (redisUrl && redisToken) {
    const redis = new Redis({
      url: redisUrl,
      token: redisToken,
      retry: false,
      signal: () => AbortSignal.timeout(1200),
      automaticDeserialization: false,
    });
    storage.cache = {
      read: (path) => redis.get<string>(path),
      write: (path, text) => redis.set(path, text, { ex: 30 * 24 * 60 * 60 }),
    };
  }
  return storage;
}
