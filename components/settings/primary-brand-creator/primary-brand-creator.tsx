"use client";
import { useState, useRef } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { Field } from "@/components/ui/field/field";
import { Button } from "@/components/ui/button/button";
import { Text } from "@/components/ui/text/text";
import { control } from "@/components/ui/control-styles/control-styles";
import { settingsPrimaryBrandCreatorMessages as englishCopy } from "@/messages/en.json";
import { settingsPrimaryBrandCreatorMessages as ukrainianCopy } from "@/messages/uk.json";
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
          ? ukrainianCopy.couldNotCreateTheBrand
          : englishCopy.couldNotCreateTheBrand,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="text-sm sm:col-span-2">
      <summary className="min-h-11 py-3 cursor-pointer focus-visible:outline-solid">
        {uk ? ukrainianCopy.brandNotInTheCatalog : englishCopy.brandNotInTheCatalog}
      </summary>
      <Field label={uk ? ukrainianCopy.labelPrimaryBrandName : englishCopy.labelPrimaryBrandName} className="gap-2 text-sm text-inherit">
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
            ? ukrainianCopy.creating
            : englishCopy.creating
          : uk
            ? ukrainianCopy.createBrand
            : englishCopy.createBrand}
      </Button>
      {error && <Text variant="body" role="alert" className="leading-normal text-inherit">{error}</Text>}
      <Text variant="body" role="status" className="mt-2 leading-normal text-(--muted)">
        {saved
          ? uk
            ? ukrainianCopy.brandSelectedSaveTheClient
            : englishCopy.brandSelectedSaveTheClient
          : uk
            ? ukrainianCopy.creatingABrandDoesNot
            : englishCopy.creatingABrandDoesNot}
      </Text>
    </details>
  );
}
