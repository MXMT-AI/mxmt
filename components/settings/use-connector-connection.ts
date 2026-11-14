"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { isPublicConnection } from "@/lib/connectors/public-connection";
import type { PublicConnection } from "@/lib/connectors/contract";
export function useConnectorConnection(
  provider: "horoshop" | "shopify",
  initial: PublicConnection,
  lang: "uk" | "en",
) {
  const copy = (uk: string, en: string) => (lang === "uk" ? uk : en),
    name = provider === "shopify" ? "Shopify" : "Horoshop";
  const [connection, setConnection] = useState(initial),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function perform(
    action: "save" | "check",
    body?: unknown,
  ): Promise<PublicConnection | null> {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const r = await apiFetch(`/api/connectors/${provider}`, {
          method: action === "save" ? "PUT" : "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
        d = await readApiJson(r);
      if (!r.ok) {
        const code = typeof d?.code === "string" ? d.code : String(r.status);
        setError(
          code === "CONNECTOR_CONFIG_CHANGED"
            ? copy(
                "Підвищіть версію змінених правил і перевірте підключення знову.",
                "Increase the revision of changed rules and check again.",
              )
            : copy(
                "Перевірте поля, підтвердження й доступи. Код: ",
                "Check fields, confirmations and permissions. Code: ",
              ) + code,
        );
        return null;
      }
      if (!isPublicConnection(d)) {
        setError(
          copy(
            "Некоректна відповідь сервера. Повторіть спробу.",
            "Invalid server response. Retry the operation.",
          ),
        );
        return null;
      }
      setConnection(d);
      window.dispatchEvent(new Event("connector-connection-changed"));
      setStatus(
        action === "save"
          ? copy(
              `Збережено. Перевірте доступи, потім виберіть ${name} у джерелах звітів.`,
              `Saved. Check read scopes, then select ${name} as the reporting source.`,
            )
          : copy(
              "Перевірки завершено. Перегляньте результат кожного ресурсу.",
              "Checks completed. Review each resource result.",
            ),
      );
      if (action === "save") setDirty(false);
      return d;
    } catch {
      setError(
        copy(
          "Не вдалося підключитися. Повторіть спробу.",
          "Could not connect. Retry the operation.",
        ),
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  return {
    connection,
    busy,
    dirty,
    error,
    status,
    alert,
    setError,
    setDirty,
    perform,
  };
}
