import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Note } from "@/components/ui/note/note";
import { Text } from "@/components/ui/text/text";
import { rawImportIsLive } from "@/lib/data-import-policy";
import type { DataStatus } from "../use-report-status/use-report-status";
import { dataReportingReportImportNoticesMessages as englishCopy } from "@/messages/en.json";
import { dataReportingReportImportNoticesMessages as ukrainianCopy } from "@/messages/uk.json";

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
          ? ukrainianCopy.refreshViewReloadsSavedData
          : englishCopy.refreshViewReloadsSavedData}
      </Note>
      {!statusLoading && status && (
        <Text variant="body" className="mb-4 break-all leading-5 text-(--muted)">
          {status.connection ? (
            <>
              {uk ? ukrainianCopy.nextImport : englishCopy.nextImport}
              <a href={`https://docs.google.com/spreadsheets/d/${status.connection.fileId}/edit`} target="_blank" rel="noreferrer" className="underline">{status.connection.fileId}</a>
              {status.source && status.source.driveFileId !== status.connection.fileId && (
                <span className="block mt-1">{uk
                  ? ukrainianCopy.thePreviousImportFromAnother
                  : englishCopy.thePreviousImportFromAnother}</span>
              )}
            </>
          ) : (
            <>
              {uk ? ukrainianCopy.connectThisCabinetSGoogleSheets : englishCopy.connectThisCabinetSGoogleSheets}
              <Link href="/settings" className="underline">{uk ? ukrainianCopy.settings : englishCopy.settings}</Link>
            </>
          )}
        </Text>
      )}
      {viewRefreshed && <Text variant="body" role="status" className="mb-4 leading-5 text-inherit">{uk ? ukrainianCopy.savedDataViewRefreshed : englishCopy.savedDataViewRefreshed}</Text>}
      {status?.latestImport?.status === "RUNNING" && (
        <Text variant="body" role="status" className="mb-4 leading-5 text-inherit">
          {rawImportIsLive(status.latestImport)
            ? (uk ? ukrainianCopy.importIsRunningPreviousData : englishCopy.importIsRunningPreviousData)
            : (uk ? ukrainianCopy.thePreviousImportExceededIts : englishCopy.thePreviousImportExceededIts)}
        </Text>
      )}
    </>
  );
}
