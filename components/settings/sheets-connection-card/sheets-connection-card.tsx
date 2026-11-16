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
            ? (uk ? "Підключення вже змінено. Оновіть сторінку." : "Connection changed. Reload this page.")
            : (uk ? "Не вдалося зберегти. Перевірте посилання та права адміністратора." : "Could not save. Check the URL and administrator access."));
          return;
        }
        setConnection(data.connection); router.refresh();
        setMessage(uk ? "Таблицю прив’язано. Тепер можна виконати імпорт у розділі «Дані та звіти»." : "Spreadsheet connected. You can now import in Data & Reports.");
      } catch { setMessage(uk ? "Помилка мережі. Спробуйте ще раз." : "Network error. Please retry."); }
      finally { inFlight.current = false; setBusy(false); }
  }
  return <section className={panel + " mb-10 p-5"}>
    <SectionHeader
      className="mb-0 [&_p]:mt-2"
      title={uk ? "Google Sheets цього кабінету" : "This cabinet’s Google Sheets"}
      description={uk
        ? "Імпорт і синхронізація читатимуть цю таблицю. Збереження не запускає імпорт і не змінює вибране джерело MVP-звітів."
        : "Import and sync will read this spreadsheet. Saving does not import data or change the selected MVP report source."}
    />
    <form className="mt-4 space-y-3" onSubmit={save}>
      <Field label={uk ? "Посилання на Google Sheets" : "Google Sheets URL"} className="gap-1 text-sm text-inherit">
        <input type="url" required value={url} onChange={e => setUrl(e.target.value)} disabled={!canManage || busy}
          placeholder="https://docs.google.com/spreadsheets/d/…/edit"
          className={cn(control, "min-h-0 bg-(--bg)")} />
      </Field>
      {connection ? <Note className="break-all leading-normal">{uk ? "Збережений ID: " : "Saved ID: "}{connection.fileId}</Note>
        : <Text variant="body" className="leading-normal text-(--muted)">{uk ? "Таблицю ще не прив’язано. Імпорт заблоковано." : "No spreadsheet connected. Import is blocked."}</Text>}
      <Button variant="accent" type="submit" disabled={!canManage || busy} className="py-2">
        {busy ? (uk ? "Збереження…" : "Saving…") : (uk ? "Зберегти підключення" : "Save connection")}
      </Button>
      <Text variant="body" role="status" aria-live="polite" className="leading-normal text-inherit">{message}</Text>
    </form>
  </section>;
}
