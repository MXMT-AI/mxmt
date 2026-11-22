"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import type { Answers, Model } from "./onboarding-types";
import { settingsOnboardingFormUseOnboardingSaveMessages as englishCopy } from "@/messages/en.json";

export function useOnboardingSave({ model, answers, enabled, onSaved }: {
  model: Model;
  answers: Answers;
  enabled: boolean;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function save() {
    if (!enabled || !model || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessModel: model, answers }),
      });
      if (!response.ok) throw new Error(await response.text());
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : englishCopy.error);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return { saving, error, save };
}
