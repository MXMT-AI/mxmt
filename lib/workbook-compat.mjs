import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";
import { posix } from "node:path";

const xmlParser = new XMLParser({ ignoreAttributes: false, trimValues: false, parseTagValue: false, processEntities: true });
const asArray = value => Array.isArray(value) ? value : value ? [value] : [];

/** Read either SheetJS worksheet representation without creating address keys. */
export function worksheetCell(sheet, row, column) {
  return sheet["!data"] ? sheet["!data"][row]?.[column] : sheet[XLSX.utils.encode_cell({ r: row, c: column })];
}

function* worksheetCells(sheet) {
  if (sheet["!data"]) {
    for (const row of sheet["!data"]) {
      if (row) for (const cell of row) if (cell) yield cell;
    }
  } else {
    for (const address in sheet) if (!address.startsWith("!")) yield sheet[address];
  }
}

/** Retain the established local-date/rounding contract used by SheetJS 0.18 imports. */
function compatibilityDate(serial) {
  const base = new Date(1899, 11, 30);
  const reference = new Date();
  const threshold = base.getTime() + (reference.getTimezoneOffset() - base.getTimezoneOffset()) * 60_000;
  // Multiplication order deliberately preserves the prior millisecond truncation.
  const value = new Date(serial * 24 * 60 * 60 * 1000 + threshold);
  if (value.getTimezoneOffset() !== reference.getTimezoneOffset()) {
    value.setTime(value.getTime() + (value.getTimezoneOffset() - reference.getTimezoneOffset()) * 60_000);
  }
  return value;
}

/**
 * Keep persisted raw-import identity and dates stable across the SheetJS upgrade.
 * Only XLSX cached string cells require the single XML decode compatibility pass.
 * @param {Buffer | ArrayBuffer | Uint8Array} buffer
 * @param {import("xlsx").ParsingOptions} [options]
 * @returns {import("xlsx").WorkBook}
 */
export function readWorkbook(buffer, options = {}) {
  const workbook = XLSX.read(buffer, { ...options, cellDates: false, cellNF: true, bookFiles: true });
  const xml = name => {
    const file = workbook.files?.[name];
    return file ? Buffer.from(file.content).toString("utf8") : null;
  };
  const workbookXml = xml("xl/workbook.xml");
  const relationshipsXml = xml("xl/_rels/workbook.xml.rels");
  if (workbookXml && relationshipsXml) {
    // No external entities, DTDs or network lookup: resolve only entries already in the archive.
    if (/<!DOCTYPE|<!ENTITY/i.test(workbookXml + relationshipsXml)) throw new Error("UNSUPPORTED_WORKBOOK_XML");
    const relationships = new Map(asArray(xmlParser.parse(relationshipsXml).Relationships?.Relationship)
      .map(relation => [relation["@_Id"], relation["@_Target"]?.startsWith("/")
        ? relation["@_Target"].slice(1) : posix.normalize(posix.join("xl", relation["@_Target"] ?? ""))]));
    for (const entry of asArray(xmlParser.parse(workbookXml).workbook?.sheets?.sheet)) {
      const sheet = workbook.Sheets[entry["@_name"]];
      const source = xml(relationships.get(entry["@_r:id"]));
      if (!sheet || !source) continue;
      if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("UNSUPPORTED_WORKBOOK_XML");
      // Bounded XML cell scan; self-closing cells must not consume the next cell.
      const openings = /<c\b([^>]*)>/g;
      for (let match; (match = openings.exec(source));) {
        if (match[1].endsWith("/")) continue;
        const end = source.indexOf("</c>", openings.lastIndex);
        if (end < 0) break;
        const body = source.slice(openings.lastIndex, end);
        openings.lastIndex = end + 4;
        const sourceType = /\bt="(str|d)"/.exec(match[1])?.[1];
        if (!sourceType || (sourceType === "d" && !options.cellDates)) continue;
        const address = /\br="([A-Z]+[0-9]+)"/.exec(match[1])?.[1];
        if (!address) continue;
        const position = XLSX.utils.decode_cell(address);
        const cell = worksheetCell(sheet, position.r, position.c);
        if (!cell) continue;
        const raw = xmlParser.parse(`<c>${body}</c>`).c?.v;
        const text = typeof raw === "string" ? raw : raw?.["#text"];
        if (text === undefined) continue;
        if (sourceType === "d") {
          const date = new Date(text);
          date.setTime(date.getTime() + date.getTimezoneOffset() * 60_000);
          cell.v = date;
          cell.t = "d";
          continue;
        }
        const value = String(text).replace(/_x([\da-fA-F]{4})_/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
        cell.v = value;
        cell.w = value;
      }
    }
  }
  for (const sheet of Object.values(workbook.Sheets)) {
    for (const cell of worksheetCells(sheet)) {
      if (options.cellDates && cell.t === "n" && typeof cell.z === "string" && XLSX.SSF.is_date(cell.z)) {
        cell.v = compatibilityDate(cell.v);
        cell.t = "d";
      }
      if (!options.cellNF) delete cell.z;
    }
  }
  delete workbook.files;
  delete workbook.keys;
  return workbook;
}

/**
 * Raw numbers/text must not become dates merely because of the source number format.
 * @template T
 * @param {import("xlsx").WorkSheet} sheet
 * @param {import("xlsx").Sheet2JSONOpts} [options]
 * @returns {T[]}
 */
export function sheetToJson(sheet, options = {}) {
  const compatibleCell = cell => cell && cell.t !== "d" && cell.z && XLSX.SSF.is_date(cell.z)
    ? { ...cell, z: undefined } : cell;
  const compatible = { ...sheet };
  if (sheet["!data"]) {
    compatible["!data"] = sheet["!data"].map(row => row?.map(compatibleCell));
  } else {
    for (const address in sheet) {
      if (!address.startsWith("!")) compatible[address] = compatibleCell(sheet[address]);
    }
  }
  return XLSX.utils.sheet_to_json(compatible, { ...options, UTC: true });
}
