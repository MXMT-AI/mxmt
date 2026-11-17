import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Note } from "@/components/ui/note/note";
import { Text } from "@/components/ui/text/text";
import { rawImportIsLive } from "@/lib/data-import-policy";
import type { DataStatus } from "../use-report-status/use-report-status";

export function ReportImportNotices({ lang, status, statusLoading, viewRefreshed }: {
  lang: Locale;
  status: Pick<DataStatus, "connection" | "source" | "latestImport"> | null;
  statusLoading: boolean;
  viewRefreshed: boolean;
}) {
  const uk = lang === "uk";
  return (
    <>
      <Note className="mb-4 leading-4">
        {uk
          ? "Оновити перегляд — перечитати збережені дані. Імпортувати — завантажити таблицю з Google. Оновити MVP-звіти — перенести збережений імпорт у п’ять основних екранів."
          : "Refresh view reloads saved data. Import downloads the workbook from Google. Refresh MVP reports projects the saved import into the five main screens."}
      </Note>
      {!statusLoading && status && (
        <Text variant="body" className="mb-4 break-all leading-5 text-(--muted)">
          {status.connection ? (
            <>
              {uk ? "Наступний імпорт: " : "Next import: "}
              <a href={`https://docs.google.com/spreadsheets/d/${status.connection.fileId}/edit`} target="_blank" rel="noreferrer" className="underline">{status.connection.fileId}</a>
              {status.source && status.source.driveFileId !== status.connection.fileId && (
                <span className="block mt-1">{uk
                  ? "Зараз показано попередній імпорт з іншої таблиці. Збереження нового підключення не змінює вже завантажені дані."
                  : "The previous import from another spreadsheet is displayed. Saving a connection does not replace imported data."}</span>
              )}
            </>
          ) : (
            <>
              {uk ? "Спочатку прив’яжіть Google Sheets до цього кабінету: " : "Connect this cabinet’s Google Sheets first: "}
              <Link href="/settings" className="underline">{uk ? "Налаштування" : "Settings"}</Link>
            </>
          )}
        </Text>
      )}
      {viewRefreshed && <Text variant="body" role="status" className="mb-4 leading-5 text-inherit">{uk ? "Перегляд збережених даних оновлено." : "Saved-data view refreshed."}</Text>}
      {status?.latestImport?.status === "RUNNING" && (
        <Text variant="body" role="status" className="mb-4 leading-5 text-inherit">
          {rawImportIsLive(status.latestImport)
            ? (uk ? "Імпорт виконується; показано попередні дані. Стан перевіряється кожні 10 секунд." : "Import is running; previous data is shown. Status is checked every 10 seconds.")
            : (uk ? "Попередній імпорт перевищив час виконання. Натисніть «Імпортувати» для відновлення; старі дані збережені." : "The previous import exceeded its execution window. Click Import to recover; previous data is retained.")}
        </Text>
      )}
    </>
  );
}
