import { expect, it } from "vitest";
import { prepareCsvFile, reparseCsvFile } from "@/components/settings/csv-import-card/prepare-csv-file";
import { CSV_LIMITS } from "@/lib/connectors/csv/parser";
const encode = (text: string) => new TextEncoder().encode(text);
it.each([",", ";", "\t"] as const)("parses %j files and maps only exact known headers", delimiter => {
  const bytes = encode(`id${delimiter}name${delimiter}Custom label\n1${delimiter}Товар${delimiter}demo\n`);
  const draft = prepareCsvFile("products", "demo.csv", bytes, delimiter);
  expect(draft.name).toBe("demo.csv");
  expect(draft.headers).toEqual(["id", "name", "Custom label"]);
  expect(draft.file.columns).toEqual({ name: "name" });
  expect(draft.file.resource).toBe("products");
  expect(draft.file.delimiter).toBe(delimiter);
  expect(Uint8Array.from(atob(draft.file.bytes), char => char.charCodeAt(0))).toEqual(bytes);
});
it("reparses original bytes and discards manual mappings without mutating the draft", () => {
  const original = prepareCsvFile("products", "demo.csv", encode("id;name\n1;Demo\n"), ",");
  original.file.columns = { name: "id;name" };
  const next = reparseCsvFile(original, ";");
  expect(next.headers).toEqual(["id", "name"]);
  expect(next.file.columns).toEqual({ name: "name" });
  expect(next.name).toBe(original.name);
  expect(next.file.bytes).toBe(original.file.bytes);
  expect(original.file.columns).toEqual({ name: "id;name" });
  expect(original.file.delimiter).toBe(",");
});
it("preserves multibyte UTF-8 across encoding chunks", () => {
  const bytes = encode("id,name\n" + Array.from({ length: 150 }, (_, i) => `${i},${"Товар".repeat(15)}`).join("\n"));
  expect(bytes.length).toBeGreaterThan(8192);
  const draft = prepareCsvFile("products", "unicode.csv", bytes, ",");
  expect(Uint8Array.from(atob(draft.file.bytes), char => char.charCodeAt(0))).toEqual(bytes);
});
it("keeps parser failures and does not silently repair malformed files", () => {
  expect(() => prepareCsvFile("products", "invalid.csv", new Uint8Array([255]), ",")).toThrow("INVALID_UTF8");
  expect(() => prepareCsvFile("products", "duplicate.csv", encode("id,id\n1,2"), ",")).toThrow("INVALID_HEADERS");
  expect(() => prepareCsvFile("products", "large.csv", new Uint8Array(CSV_LIMITS.fileBytes + 1), ",")).toThrow("FILE_TOO_LARGE");
});
