import { payloadHash } from "./order-storage";
import { ConnectorReadError } from "./read-error";
import type { ConnectorPage, ConnectorPosition, PageRequest } from "./contract";
export interface ContinuationState {
  version: 1;
  binding: string;
  position: ConnectorPosition;
  sequence: number;
  seen: string[];
}
export function continuation(
  state: ContinuationState | undefined,
  binding: unknown,
  kind: ConnectorPosition["kind"] = "page",
  legacyPage = 1,
): ContinuationState {
  const key = payloadHash(binding);
  if (state) {
    if (state.binding !== key) throw new Error("CONNECTOR_CONFIG_CHANGED");
    if (
      state.version !== 1 ||
      state.binding !== key ||
      state.position.kind !== kind ||
      !Number.isSafeInteger(state.sequence) ||
      state.sequence < 0 ||
      state.sequence >= 10000 ||
      !Array.isArray(state.seen) ||
      state.seen.length > 10000
    )
      throw new ConnectorReadError("INVALID_RESPONSE");
    validPosition(state.position);
    return state;
  }
  const position: ConnectorPosition =
    kind === "page"
      ? { kind, page: legacyPage }
      : kind === "offset"
        ? { kind, offset: 0 }
        : { kind, cursor: null };
  validPosition(position);
  return {
    version: 1,
    binding: key,
    position,
    sequence: 0,
    seen: [payloadHash(position)],
  };
}
function validPosition(p: ConnectorPosition) {
  if (
    !p ||
    (p.kind === "page"
      ? !Number.isSafeInteger(p.page) || p.page < 1
      : p.kind === "offset"
        ? !Number.isSafeInteger(p.offset) || p.offset < 0
        : p.kind === "cursor"
          ? p.cursor !== null &&
            (typeof p.cursor !== "string" ||
              !p.cursor ||
              p.cursor.length > 4096)
          : true)
  )
    throw new ConnectorReadError("INVALID_RESPONSE");
}
export function pageRequest(state: ContinuationState): PageRequest {
  const p = state.position;
  return p.kind === "page"
    ? { page: p.page }
    : p.kind === "offset"
      ? { offset: p.offset }
      : { cursor: p.cursor };
}
/** A cursor/offset can never be mistaken for the old nextPage=null completion signal. */
export function advancePage<T>(
  state: ContinuationState,
  page: ConnectorPage<T>,
  limit: number,
): ContinuationState | null {
  if (
    !Array.isArray(page.records) ||
    page.records.length > limit ||
    !Number.isFinite(Date.parse(page.observedAt))
  )
    throw new ConnectorReadError("INVALID_RESPONSE");
  let next = page.next;
  if (next === undefined) {
    if (
      state.position.kind !== "page" ||
      (page.nextPage !== null &&
        (!Number.isSafeInteger(page.nextPage) ||
          page.nextPage !== state.position.page + 1))
    )
      throw new ConnectorReadError("INVALID_RESPONSE");
    next =
      page.nextPage === null ? null : { kind: "page", page: page.nextPage };
  } else if (page.nextPage !== null)
    throw new ConnectorReadError("INVALID_RESPONSE");
  if (next === null) return null;
  validPosition(next);
  if (next.kind !== state.position.kind)
    throw new ConnectorReadError("INVALID_RESPONSE");
  if (
    (next.kind === "page" &&
      state.position.kind === "page" &&
      next.page !== state.position.page + 1) ||
    (next.kind === "offset" &&
      state.position.kind === "offset" &&
      (page.records.length === 0 ||
        next.offset !== state.position.offset + page.records.length))
  )
    throw new ConnectorReadError("INVALID_RESPONSE");
  const hash = payloadHash(next);
  if (state.seen.includes(hash) || state.sequence >= 9999)
    throw new ConnectorReadError("INVALID_RESPONSE");
  return {
    ...state,
    position: next,
    sequence: state.sequence + 1,
    seen: [...state.seen, hash],
  };
}
