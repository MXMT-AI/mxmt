"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { ReportingSources as Sources } from "@/lib/reporting-source-contract";
import type { Lang } from "@/lib/translations";
import { connectorSourceCopy } from "./copy";

export function useConnectorSource(lang: Lang, canManage: boolean) {
  const copy = connectorSourceCopy[lang];
  const router = useRouter();
  const saving = useRef(false);
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
            setError(copy.loadError);
        });
    void load();
    window.addEventListener("connector-connection-changed", load);
    return () => {
      active = false;
      window.removeEventListener("connector-connection-changed", load);
    };
  }, [copy]);
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
  async function activate() {
    if (!canManage || !data || !source || !dirty || saving.current) return;
    saving.current = true;
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
        setError(copy.changeError);
        return;
      }
      setData(body as unknown as Sources);
      setMessage(copy.success);
      router.refresh();
    } catch {
      setError(copy.networkError);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return { data, source, setSource, busy, error, message, dirty, activate };
}
