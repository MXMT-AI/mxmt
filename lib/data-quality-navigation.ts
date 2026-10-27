/** Preserve the Settings URL while normalizing diagnostic-only state. */
export function readQualitySelection(params: URLSearchParams) {
  const code = params.get("qualityCode") ?? "",
    page = Number(params.get("qualityPage"));
  return {
    code: /^[A-Z_]{1,100}$/.test(code) ? code : "",
    q: (params.get("qualityQ") ?? "").slice(0, 200),
    page: Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1,
  };
}
/** Update only diagnostic parameters, omitting empty filters and the default first page. */
export function writeQualitySelection(
  params: URLSearchParams,
  value: { code: string; q: string; page: number },
) {
  const next = new URLSearchParams(params);
  for (const [key, v] of Object.entries({
    qualityCode: value.code,
    qualityQ: value.q,
    qualityPage: value.page === 1 ? "" : String(value.page),
  })) {
    if (v) next.set(key, v);
    else next.delete(key);
  }
  return next;
}
