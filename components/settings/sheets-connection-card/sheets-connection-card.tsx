"use client";
import { Field } from "@/components/ui/field/field";
import { Button } from "@/components/ui/button/button";
import { SectionHeader } from "@/components/ui/section-header/section-header";
import { Text } from "@/components/ui/text/text";
import { Note } from "@/components/ui/note/note";
import { control } from "@/components/ui/control-styles/control-styles";
import { panel } from "@/components/ui/panel/panel-styles";
import { cn } from "@/lib/utils";
import { useState, useRef, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/fetch";
import { settingsSheetsConnectionCardMessages as englishCopy } from "@/messages/en.json";
import { settingsSheetsConnectionCardMessages as ukrainianCopy } from "@/messages/uk.json";
interface Connection { fileId: string; revision: number; origin: "tenant" | "legacy_approved" }
export default function SheetsConnectionCard({ initial, lang, canManage }: {
  initial: Connection | null; lang: "uk" | "en"; canManage: boolean;
}) {
  const uk = lang === "uk", router = useRouter();
  const [connection, setConnection] = useState(initial);
  const [url, setUrl] = useState(initial ? `https://docs.google.com/spreadsheets/d/${initial.fileId}/edit` : "");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const inFlight = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
      try {
        const response = await apiFetch("/api/settings/google-sheets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, revision: connection?.revision ?? 0 }) });
        const data = await response.json();
        if (!response.ok) {
          setMessage(data.code === "SHEETS_CONNECTION_CHANGED"
            ? (uk ? ukrainianCopy.connectionChangedReloadThisPage : englishCopy.connectionChangedReloadThisPage)
            : (uk ? ukrainianCopy.couldNotSaveCheckThe : englishCopy.couldNotSaveCheckThe));
          return;
        }
        setConnection(data.connection); router.refresh();
        setMessage(uk ? ukrainianCopy.spreadsheetConnectedYouCanNow : englishCopy.spreadsheetConnectedYouCanNow);
      } catch { setMessage(uk ? ukrainianCopy.networkErrorPleaseRetry : englishCopy.networkErrorPleaseRetry); }
      finally { inFlight.current = false; setBusy(false); }
  }
  return <section className={panel + " mb-10 p-5"}>
    <SectionHeader
      className="mb-0 [&_p]:mt-2"
      title={uk ? ukrainianCopy.titleThisCabinetSGoogleSheets : englishCopy.titleThisCabinetSGoogleSheets}
      description={uk
        ? ukrainianCopy.descriptionImportAndSyncWillRead
        : englishCopy.descriptionImportAndSyncWillRead}
    />
    <form className="mt-4 space-y-3" onSubmit={save}>
      <Field label={uk ? ukrainianCopy.labelGoogleSheetsURL : englishCopy.labelGoogleSheetsURL} className="gap-1 text-sm text-inherit">
        <input type="url" required value={url} onChange={e => setUrl(e.target.value)} disabled={!canManage || busy}
          placeholder={englishCopy.placeholderHttpsDocsGoogleComSpreadsheetsDEdit}
          className={cn(control, "min-h-0 bg-(--bg)")} />
      </Field>
      {connection ? <Note className="break-all leading-normal">{uk ? ukrainianCopy.savedID : englishCopy.savedID}{connection.fileId}</Note>
        : <Text variant="body" className="leading-normal text-(--muted)">{uk ? ukrainianCopy.noSpreadsheetConnectedImportIs : englishCopy.noSpreadsheetConnectedImportIs}</Text>}
      <Button variant="accent" type="submit" disabled={!canManage || busy} className="py-2">
        {busy ? (uk ? ukrainianCopy.saving : englishCopy.saving) : (uk ? ukrainianCopy.saveConnection : englishCopy.saveConnection)}
      </Button>
      <Text variant="body" role="status" aria-live="polite" className="leading-normal text-inherit">{message}</Text>
    </form>
  </section>;
}
