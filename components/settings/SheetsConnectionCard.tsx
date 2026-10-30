"use client";
import { useState } from "react";
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
  return <section className="mb-10 rounded-xl border border-(--border) bg-(--surface) p-5">
    <h2 className="font-semibold">{uk ? "Google Sheets цього кабінету" : "This cabinet’s Google Sheets"}</h2>
    <p className="mt-2 text-sm text-(--muted)">{uk
      ? "Імпорт і синхронізація читатимуть цю таблицю. Збереження не запускає імпорт і не змінює вибране джерело MVP-звітів."
      : "Import and sync will read this spreadsheet. Saving does not import data or change the selected MVP report source."}</p>
    <form className="mt-4 space-y-3" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setMessage("");
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
      finally { setBusy(false); }
    }}>
      <label className="block text-sm">{uk ? "Посилання на Google Sheets" : "Google Sheets URL"}
        <input type="url" required value={url} onChange={e => setUrl(e.target.value)} disabled={!canManage || busy}
          placeholder="https://docs.google.com/spreadsheets/d/…/edit"
          className="mt-1 w-full rounded-lg border border-(--border) bg-(--bg) px-3 py-2" />
      </label>
      {connection ? <p className="break-all text-xs text-(--muted)">{uk ? "Збережений ID: " : "Saved ID: "}{connection.fileId}</p>
        : <p className="text-sm text-(--muted)">{uk ? "Таблицю ще не прив’язано. Імпорт заблоковано." : "No spreadsheet connected. Import is blocked."}</p>}
      <button type="submit" disabled={!canManage || busy} className="rounded-lg bg-accent-cyan px-4 py-2 text-black disabled:opacity-50">
        {busy ? (uk ? "Збереження…" : "Saving…") : (uk ? "Зберегти підключення" : "Save connection")}
      </button>
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </form>
  </section>;
}
