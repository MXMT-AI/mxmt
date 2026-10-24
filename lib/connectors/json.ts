import "server-only";
import { parse } from "lossless-json";

/** Preserve decimal and large integer tokens before ID validation or money projection. */
export function parseSourceJson(body: string): unknown {
  return parse(body, null, { parseNumber: (value: string) =>
    /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : value });
}
