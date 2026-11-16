"use client";
import { useState, useRef } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { Field } from "@/components/ui/field/field";
import { Button } from "@/components/ui/button/button";
import { Text } from "@/components/ui/text/text";
import { control } from "@/components/ui/control-styles/control-styles";
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
  const inFlight = useRef(false);
  async function create() {
    if (busy || disabled || !name.trim() || inFlight.current) return;
    inFlight.current = true;
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
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="text-sm sm:col-span-2">
      <summary className="min-h-11 py-3 cursor-pointer focus-visible:outline-solid">
        {uk ? "Бренду ще немає в каталозі?" : "Brand not in the catalog yet?"}
      </summary>
      <Field label={uk ? "Назва основного бренду" : "Primary brand name"} className="gap-2 text-sm text-inherit">
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
          className={control}
        />
      </Field>
      <Button
        variant="report"
        type="button"
        className="mt-3 bg-(--surface) px-3"
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
      </Button>
      {error && <Text variant="body" role="alert" className="leading-normal text-inherit">{error}</Text>}
      <Text variant="body" role="status" className="mt-2 leading-normal text-(--muted)">
        {saved
          ? uk
            ? "Бренд обрано. Збережіть профіль клієнта й окремо підтвердьте власність та умови."
            : "Brand selected. Save the client profile and confirm ownership and terms separately."
          : uk
            ? "Створення бренду не підтверджує власність, комісію або постачальника."
            : "Creating a brand does not confirm ownership, commission or supplier terms."}
      </Text>
    </details>
  );
}
