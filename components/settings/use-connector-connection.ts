"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { isPublicConnection } from "@/lib/connectors/public-connection";
import type { PublicConnection } from "@/lib/connectors/contract";
import { formatMessage } from "@/i18n/format-message";
import { settingsUseConnectorConnectionMessages as englishCopy } from "@/messages/en.json";
import { settingsUseConnectorConnectionMessages as ukrainianCopy } from "@/messages/uk.json";
export interface ConnectorConnectionMessages {
  validationError?: string;
  configChanged?: string;
  failurePrefix?: string;
  invalidResponse?: string;
  saved?: string;
  checked?: string;
  storageUnavailable?: string;
  failure?: string;
  networkError?: string;
}
export function useConnectorConnection(
  provider: "horoshop" | "shopify" | "keycrm" | "salesdrive",
  initial: PublicConnection,
  lang: "uk" | "en",
  messages: ConnectorConnectionMessages = {},
) {
  const copy = lang === "uk" ? ukrainianCopy : englishCopy,
    name = { shopify: "Shopify", horoshop: "Horoshop", keycrm: "KeyCRM", salesdrive: "SalesDrive" }[provider];
  const [connection, setConnection] = useState(initial),
    [activeAction, setActiveAction] = useState<"save" | "check" | null>(null),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const alert = useRef<HTMLParagraphElement>(null);
  const inFlight = useRef(false);
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
    onSettled?: () => void,
  ): Promise<PublicConnection | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setActiveAction(action);
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
          code === "CONNECTOR_STORAGE_UNAVAILABLE" && messages.storageUnavailable
            ? messages.storageUnavailable
            : code === "VALIDATION_ERROR" && messages.validationError
            ? messages.validationError
            : code === "CONNECTOR_CONFIG_CHANGED"
            ? messages.configChanged ?? copy.increaseTheRevisionOfChanged
            : messages.failure ?? (messages.failurePrefix ?? copy.checkFieldsConfirmationsAndPermissions) + code,
        );
        return null;
      }
      if (!isPublicConnection(d)) {
        setError(
          messages.invalidResponse ?? copy.invalidServerResponseRetryThe,
        );
        return null;
      }
      setConnection(d);
      window.dispatchEvent(new Event("connector-connection-changed"));
      setStatus(
        action === "save"
          ? messages.saved ?? formatMessage(copy.savedCheckReadScopesThen, { name })
          : messages.checked ?? copy.checksCompletedReviewEachResource,
      );
      if (action === "save") setDirty(false);
      return d;
    } catch {
      setError(
        messages.networkError ?? copy.couldNotConnectRetryThe,
      );
      return null;
    } finally {
      try {
        onSettled?.();
      } finally {
        inFlight.current = false;
        setActiveAction(null);
      }
    }
  }
  return {
    connection,
    busy: activeAction !== null,
    activeAction,
    dirty,
    error,
    status,
    alert,
    setError,
    setDirty,
    perform,
  };
}
