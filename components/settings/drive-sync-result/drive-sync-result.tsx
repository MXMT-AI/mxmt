import { Note } from "@/components/ui/note/note";
import type { Lang } from "@/lib/translations";
import type { DriveSyncState } from "../drive-sync-card/use-drive-sync";

export function DriveSyncResult({ result, errMsg, importResult, lang }: Pick<DriveSyncState, "result" | "errMsg" | "importResult"> & { lang: Lang }) {
  const uk = lang === "uk";
  if (result === "error") {
    return <Note className="mt-2 whitespace-pre-wrap leading-normal text-[#fca5a5]">{errMsg}</Note>;
  }
  if (result === "warn") {
    return (
      <div className="mt-2">
        <Note className="mb-1 font-medium leading-normal text-accent-yellow">⚠ {uk ? "Імпортовано 0 записів" : "0 records imported"}</Note>
        <Note className="whitespace-pre-wrap leading-normal">{errMsg}</Note>
      </div>
    );
  }
  if (result !== "ok" || !importResult) return null;
  return (
    <div className="mt-2">
      <Note className="mb-1 font-medium leading-normal text-[#86efac]">✓ {uk ? "Синхронізовано успішно" : "Sync complete"}</Note>
      <Note className="font-mono leading-normal">
        SKU: {importResult.skus} · {uk ? "Залишки" : "Stock"}: {importResult.inventory} · {uk ? "Продажі" : "Sales"}: {importResult.sales}
      </Note>
      {importResult.sheets.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {importResult.sheets.map((sheet, index) => (
            <Note key={index} className="font-mono text-[10px] leading-normal text-[#484f58]">
              {sheet.skipped ? `⚠ «${sheet.name}»: ${sheet.skipped}` : `✓ «${sheet.name}»: ${sheet.imported}`}
            </Note>
          ))}
        </div>
      )}
      <Note className="mt-1 leading-normal text-(--subtle)">{uk ? "Оновіть сторінку щоб побачити дані." : "Refresh the page to see data."}</Note>
    </div>
  );
}
