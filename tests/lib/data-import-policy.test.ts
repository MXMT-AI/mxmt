import { it, expect } from "vitest";
import { rawImportIsLive, RAW_IMPORT_MAX_RUNTIME_MS } from "@/lib/data-import-policy";
it("distinguishes fresh claims, expired claims and terminal statuses", () => {
  const start = Date.parse('2026-10-30T10:00:00Z');
  const run = {status:'RUNNING',createdAt:new Date(start).toISOString()};
  expect(rawImportIsLive(run,start+RAW_IMPORT_MAX_RUNTIME_MS-1)).toBe(true);
  expect(rawImportIsLive(run,start+RAW_IMPORT_MAX_RUNTIME_MS)).toBe(false);
  expect(rawImportIsLive({...run,status:'SUCCESS'},start)).toBe(false);
  expect(rawImportIsLive({...run,createdAt:'invalid'},start)).toBe(false);
  expect(rawImportIsLive(null,start)).toBe(false);
});
