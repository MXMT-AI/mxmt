"use client";
import { useState, useRef } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
/** Bootstrap monobrand identity within the existing Settings form before credentials or catalog data are available. */
export default function PrimaryBrandCreator({
  lang,
  disabled,
  onCreated,
}: {
  lang: "uk" | "en";
  disabled: boolean;
  onCreated: (brand: { id: string; name: string }) => void;
}) {
  const uk = lang === "uk",
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  /** Create only identity; the enclosing profile form remains an explicit, separate save. */
  async function create() {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const r = await apiFetch("/api/settings/merchandising", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createBrand", name }),
      });
      const b = await readApiJson<{ id?: string; name?: string }>(r);
      if (!r.ok || !b.id || !b.name) throw new Error();
      onCreated({ id: b.id, name: b.name });
      setSaved(true);
      setName("");
    } catch {
      nameRef.current?.focus();
      setError(
        uk
          ? "Не вдалося створити бренд. Перевірте назву та повторіть спробу."
          : "Could not create the brand. Check its name and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const input =
    "min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2";
  return (
    <details className="text-sm sm:col-span-2">
      <summary className="min-h-11 py-3 cursor-pointer focus-visible:outline">
        {uk ? "Бренду ще немає в каталозі?" : "Brand not in the catalog yet?"}
      </summary>
      <label className="block">
        {uk ? "Назва основного бренду" : "Primary brand name"}
        <input
          ref={nameRef}
          name="primary-brand-name"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void create();
            }
          }}
          value={name}
          maxLength={200}
          autoComplete="off"
          disabled={busy || disabled}
          onChange={(e) => setName(e.target.value)}
          className={input + " block mt-2 w-full"}
        />
      </label>
      <button
        type="button"
        className={input + " mt-3 disabled:opacity-50 touch-manipulation"}
        disabled={!name.trim() || busy || disabled}
        onClick={create}
      >
        {busy
          ? uk
            ? "Створення…"
            : "Creating…"
          : uk
            ? "Створити бренд"
            : "Create brand"}
      </button>
      {error && <p role="alert">{error}</p>}
      <p role="status" className="mt-2 text-[var(--muted)]">
        {saved
          ? uk
            ? "Бренд обрано. Збережіть профіль клієнта й окремо підтвердьте власність та умови."
            : "Brand selected. Save the client profile and confirm ownership and terms separately."
          : uk
            ? "Створення бренду не підтверджує власність, комісію або постачальника."
            : "Creating a brand does not confirm ownership, commission or supplier terms."}
      </p>
    </details>
  );
}
