"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { Field, control } from "@/components/merchandising/FormControls";
type Sources = {
  sourceId: string | null;
  revision: number;
  connections: Array<{
    sourceId: string;
    provider: string;
    accountHost: string;
    lastCheck: { ok?: boolean } | null;
  }>;
};
export default function ConnectorSourceCard({
  lang,
  canManage,
}: {
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const uk = lang === "uk",
    router = useRouter();
  const [data, setData] = useState<Sources | null>(null),
    [source, setSource] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      apiFetch("/api/connectors/source")
        .then(async (r) => {
          const body = await readApiJson(r);
          if (!r.ok) throw new Error();
          if (active) {
            const value = body as unknown as Sources;
            setData(value);
            setSource(value.sourceId ?? "");
            setError("");
          }
        })
        .catch(() => {
          if (active)
            setError(
              uk
                ? "Не вдалося завантажити джерела. Оновіть сторінку."
                : "Sources could not be loaded. Refresh the page.",
            );
        });
    void load();
    window.addEventListener("connector-connection-changed", load);
    return () => {
      active = false;
      window.removeEventListener("connector-connection-changed", load);
    };
  }, [uk]);
  const dirty = Boolean(data && source !== (data.sourceId ?? ""));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function activate(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch("/api/connectors/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: source, revision: data.revision }),
      });
      const body = await readApiJson(response);
      if (!response.ok) {
        setError(
          uk
            ? "Не вдалося змінити джерело. Перевірте з’єднання й оновіть сторінку."
            : "Source could not be changed. Check the connection and refresh the page.",
        );
        return;
      }
      setData(body as unknown as Sources);
      setMessage(
        uk
          ? "Джерело змінено. Оновіть звіт, щоб отримати актуальні дані."
          : "Source changed. Refresh the report to use the selected source.",
      );
      router.refresh();
    } catch {
      setError(
        uk ? "Помилка мережі. Спробуйте ще раз." : "Network error. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mb-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 min-w-0">
      <h2 className="font-semibold text-[var(--text)]">
        {uk ? "Джерело звітів" : "Reporting source"}
      </h2>
      <p className="mt-1 mb-4 text-sm text-[var(--muted)]">
        {uk
          ? "Для звітів використовується одне джерело. Збереження іншого з’єднання не змінює цей вибір. Історія звітів і експортів зберігається."
          : "Reports use one selected source. Saving another connection does not change this selection. Report and export history is retained."}
      </p>
      <form onSubmit={activate} className="space-y-3">
        <Field label={uk ? "Збережене джерело" : "Saved source"}>
          <select
            className={control}
            name="connector-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={!canManage || busy || !data}
          >
            <option value="">
              {data && !data.connections.length
                ? uk
                  ? "Спочатку збережіть з’єднання"
                  : "Save a connection first"
                : uk
                  ? "Виберіть джерело"
                  : "Choose a source"}
            </option>
            {source &&
            data &&
            !data.connections.some((c) => c.sourceId === source) ? (
              <option value={source}>
                {uk
                  ? "Попереднє джерело недоступне"
                  : "Previous source unavailable"}
              </option>
            ) : null}
            {data?.connections.map((c) => (
              <option
                key={c.sourceId}
                value={c.sourceId}
                disabled={
                  c.lastCheck?.ok !== true && c.sourceId !== data.sourceId
                }
              >
                {c.provider} · {c.accountHost}
                {c.lastCheck?.ok !== true
                  ? uk
                    ? " — перевірте доступ"
                    : " — check access"
                  : ""}
              </option>
            ))}
          </select>
        </Field>
        {canManage ? (
          <button
            type="submit"
            disabled={busy || !source || !dirty}
            className="min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--bg)] focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
          >
            {busy
              ? uk
                ? "Змінюємо…"
                : "Changing…"
              : uk
                ? "Використовувати для звітів"
                : "Use for reports"}
          </button>
        ) : null}
      </form>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      ) : null}
      <p role="status" className="mt-3 text-sm text-[var(--muted)]">
        {message}
      </p>
    </section>
  );
}
