import { describe, expect, it } from "vitest";
import { readWorkbook, sheetToJson } from "@/lib/workbook-compat.mjs";
import fixture from "../fixtures/workbook-compatibility.json";

const buffer = Buffer.from(fixture.base64, "base64");

describe("SheetJS import compatibility", () => {
  it.each([false, true])("keeps dense values identical to sparse decoding with cellDates=%s", cellDates => {
    const options = { type: "buffer" as const, cellDates, cellNF: true };
    const sparse = readWorkbook(buffer, options);
    const selected = readWorkbook(buffer, { ...options, dense: true, cellFormula: false, cellHTML: false, sheets: ["Synthetic"] });
    expect(sheetToJson(selected.Sheets.Synthetic, { header: 1, raw: true, defval: null }))
      .toEqual(sheetToJson(sparse.Sheets.Synthetic, { header: 1, raw: true, defval: null }));
    expect(selected).not.toHaveProperty("files");
  });

  it("keeps financial numbers raw despite a date number format", () => {
    const workbook = readWorkbook(buffer, { type: "buffer", cellDates: false, cellNF: true });
    const rows = sheetToJson<unknown[]>(workbook.Sheets.Synthetic, { header: 1, raw: true, defval: null });
    expect(rows[1][1]).toBe(100);
    expect(rows[1][3]).toBe(46323.99454);
  });

  it("decodes cached XML strings once and does not consume a self-closing neighbour", () => {
    const workbook = readWorkbook(buffer, { type: "buffer" });
    const rows = sheetToJson<unknown[]>(workbook.Sheets.Synthetic, { header: 1, raw: true, defval: null });
    expect(rows[1][2]).toBe("R&amp;D");
    expect(rows[2][2]).toBe("After an empty cell &amp; unchanged");
  });

  it("keeps date cells as the reader's original Date without a second timezone conversion", () => {
    const workbook = readWorkbook(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets.Synthetic;
    expect(sheet.D2.v).toBeInstanceOf(Date);
    const rows = sheetToJson<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    expect(rows[1][3]).toEqual(sheet.D2.v);
  });

  it("does not expose archive files outside the reader", () => {
    const workbook = readWorkbook(buffer, { type: "buffer" });
    expect(workbook).not.toHaveProperty("files");
    expect(workbook).not.toHaveProperty("keys");
  });
});
