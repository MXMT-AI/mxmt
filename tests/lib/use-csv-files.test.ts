import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useCsvFiles } from "@/components/settings/csv-import-card/use-csv-files";
import { prepareCsvFile } from "@/components/settings/csv-import-card/prepare-csv-file";
import type { CsvFileDraft } from "@/components/settings/csv-import-card/csv-import-types";
import type { CsvResource } from "@/lib/connectors/csv/schema";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn() }));
const onChanged = vi.fn(), onFailure = vi.fn();
const original = () => prepareCsvFile("products", "demo.csv", new TextEncoder().encode("productId;name\n1;Demo\n"), ";");
let files: Partial<Record<CsvResource, CsvFileDraft>>;
function start({ canManage = true, busy = false, initial = {} as typeof files, delimiters = {} } = {}) {
  files = initial;
  vi.mocked(useState).mockReturnValueOnce([files, (update: (current: typeof files) => typeof files) => { files = update(files); }] as never).mockReturnValueOnce([delimiters, vi.fn()] as never);
  const run = vi.fn(async (task: () => void | Promise<void>, fail: (error: unknown) => void) => { try { await task(); } catch (error) { fail(error); } });
  return { ...useCsvFiles({ canManage, busy, run, onChanged, onFailure }), run };
}
beforeEach(() => vi.clearAllMocks());
it("reads a selected file using the chosen delimiter and invalidates approval", async () => {
  const state = start({ delimiters: { products: ";" } });
  await state.choose("products", new File(["productId;name\n1;Demo"], "demo.csv"));
  expect(onChanged).toHaveBeenCalledOnce();
  expect(files.products).toMatchObject({ name: "demo.csv", headers: ["productId", "name"], file: { delimiter: ";", columns: { productId: "productId", name: "name" } } });
});
it.each([{ canManage: false }, { busy: true }])("rejects file changes when unavailable: %j", async options => {
  const state = start(options);
  await state.choose("products", new File(["productId\n1"], "demo.csv"));
  expect(state.run).not.toHaveBeenCalled();
  expect(onChanged).not.toHaveBeenCalled();
});
it("removes only the selected resource on cancellation or parsing failure", async () => {
  const stock = { ...original(), name: "stock.csv" };
  const state = start({ initial: { products: original(), stock } });
  await state.choose("products", undefined);
  expect(files).toEqual({ stock });
  await state.choose("products", new File(["name,name\na,b"], "bad.csv"));
  expect(files).toEqual({ stock });
  expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ code: "INVALID_HEADERS" }), "products");
});
it("reparses on delimiter change and drops manual mappings", () => {
  const draft = prepareCsvFile("products", "demo.csv", new TextEncoder().encode("productId;name\n1;Demo"), ",");
  draft.file.columns = { name: "productId;name" };
  const state = start({ initial: { products: draft } });
  state.delimiter("products", ";");
  expect(onChanged).toHaveBeenCalledOnce();
  expect(files.products!.file.columns).toEqual({ productId: "productId", name: "name" });
  expect(draft.file.columns).toEqual({ name: "productId;name" });
});
it("removes an invalid reparse and reports its failure", () => {
  const draft = prepareCsvFile("products", "demo.csv", new TextEncoder().encode("name;name\na;b"), ",");
  const state = start({ initial: { products: draft } });
  state.delimiter("products", ";");
  expect(files.products).toBeUndefined();
  expect(onFailure).toHaveBeenCalledOnce();
});
it("changes or clears one mapped column without mutating the original draft", () => {
  const draft = original();
  const state = start({ initial: { products: draft } });
  state.mapColumn("products", "name", "Custom");
  expect(files.products!.file.columns).toEqual({ productId: "productId", name: "Custom" });
  state.mapColumn("products", "name", "");
  expect(files.products!.file.columns).toEqual({ productId: "productId" });
  expect(draft.file.columns.name).toBe("name");
  const before = files;
  state.mapColumn("stock", "quantity", "Amount");
  expect(files).toBe(before);
});
