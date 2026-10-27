import { expect, it } from "vitest";
import { parseCsv, CSV_LIMITS } from "@/lib/connectors/csv/parser";
const bytes = (s: string) => new TextEncoder().encode(s);
it("preserves BOM, leading-zero identities, quoted delimiters, escaped quotes and physical multiline row references", () => {
  const parsed = parseCsv(
    bytes(
      '\ufeffid;name;amount\r\n00001;"a; b ""quoted""\nnext";1.2300\r\n00002;zero;0\r\n',
    ),
    ";",
  );
  expect(parsed.rows).toEqual([
    {
      row: 2,
      cells: { id: "00001", name: 'a; b "quoted"\nnext', amount: "1.2300" },
    },
    { row: 4, cells: { id: "00002", name: "zero", amount: "0" } },
  ]);
  expect(parseCsv(bytes("id\tqty\n0001\t\n"), "\t").rows[0].cells).toEqual({
    id: "0001",
    qty: "",
  });
});
it.each([
  "id,id\na,b",
  "id,name\na",
  "id,name\na,b,c",
  'id\n"truncated',
  'id\nno"quote',
  'id\n"closed"tail',
  "id\rvalue",
  "id\n\0",
])("rejects malformed or truncated CSV %j", (s) =>
  expect(() => parseCsv(bytes(s), ",")).toThrow(),
);
it("bounds bytes, rows, fields and individual values and rejects invalid UTF-8", () => {
  expect(() => parseCsv(new Uint8Array([0xff]), ",")).toThrow("INVALID_UTF8");
  expect(() => parseCsv(new Uint8Array(CSV_LIMITS.fileBytes + 1), ",")).toThrow(
    "FILE_TOO_LARGE",
  );
  expect(() =>
    parseCsv(bytes("id\n" + "a\n".repeat(CSV_LIMITS.rows + 1)), ","),
  ).toThrow("TOO_MANY_ROWS");
  expect(() =>
    parseCsv(bytes("id\n" + "a".repeat(CSV_LIMITS.fieldChars + 1)), ","),
  ).toThrow("FIELD_TOO_LONG");
  expect(() =>
    parseCsv(bytes(Array(49).fill("header").join(",")), ","),
  ).toThrow("TOO_MANY_COLUMNS");
});
