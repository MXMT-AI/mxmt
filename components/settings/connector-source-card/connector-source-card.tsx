"use client";

import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Button } from "@/components/ui/button/button";
import { panel } from "@/components/ui/panel/panel-styles";
import type { Lang } from "@/lib/translations";
import { connectorSourceCopy } from "./copy";
import { useConnectorSource } from "./use-connector-source";
import { settingsConnectorSourceCardMessages as englishCopy } from "@/messages/en.json";

export default function ConnectorSourceCard({ lang, canManage }: { lang: Lang; canManage: boolean }) {
  const copy = connectorSourceCopy[lang];
  const { data, source, setSource, busy, error, message, dirty, activate } = useConnectorSource(lang, canManage);
  return (
    <section className={panel + " mb-10 p-5"}>
      <Heading as="h2" variant="compact" className="text-base">{copy.title}</Heading>
      <Text variant="body" className="mt-1 mb-4 leading-normal text-(--muted)">{copy.description}</Text>
      <form onSubmit={event => { event.preventDefault(); void activate(); }} className="space-y-3">
        <Field label={copy.source}>
          <select
            className={control}
            name="connector-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={!canManage || busy || !data}
          >
            <option value="">
              {data && !data.connections.length ? copy.empty : copy.choose}
            </option>
            {source &&
            data &&
            !data.connections.some((c) => c.sourceId === source) ? (
              <option value={source}>
                {copy.unavailable}
              </option>
            ) : null}
            {data?.connections.map((c) => (
              <option
                key={c.sourceId}
                value={c.sourceId}
                disabled={
                  !c.selectable && c.sourceId !== data.sourceId
                }
              >
                {c.provider === "sheets" ? englishCopy.googleSheets : c.provider} · {c.accountHost}
                {copy.readiness[c.readiness]}
              </option>
            ))}
          </select>
        </Field>
        {canManage ? (
          <Button
            variant="report"
            type="submit"
            disabled={busy || !source || !dirty}
            className="text-(--text) hover:bg-(--bg)"
          >
            {busy ? copy.changing : copy.submit}
          </Button>
        ) : null}
      </form>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      ) : null}
      <p role="status" className="mt-3 text-sm text-(--muted)">
        {message}
      </p>
    </section>
  );
}
