"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { fetchCsvUpload, previewCsvPacket, runCsvPacketAction, type CsvUploadsResponse } from "@/lib/client/csv-import-request";
import { useRouter } from "@/i18n/navigation";

import {
  type CsvOptions,
  type CsvResource,
} from "@/lib/connectors/csv/schema";
import { CsvError } from "@/lib/connectors/csv/parser";
import type { CsvPreview as Preview, CsvPacketAction } from "./csv-import-types";
import { csvResourceNames as names, csvErrorCopy as errorCopy } from "./copy";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Note } from "@/components/ui/note/note";
import { csvImportCopy } from "./copy";
import { CsvImportConfirmation } from "../csv-import-confirmation/csv-import-confirmation";
import StatusMappingFields from "../status-mapping-fields/status-mapping-fields";
import { csvStatusMappingConfig } from "./csv-status-mapping-config";
import { CsvPacketSettings } from "../csv-packet-settings/csv-packet-settings";
import { CsvPopulationRules } from "../csv-population-rules/csv-population-rules";
import { CsvHistoryRules, type CsvHistoryRuleValues } from "../csv-history-rules/csv-history-rules";
import { CsvReceiptRules, type CsvReceiptRuleValues } from "../csv-receipt-rules/csv-receipt-rules";
import { CsvAmountRules } from "../csv-amount-rules/csv-amount-rules";
import { ChannelMappingFields } from "../channel-mapping-fields/channel-mapping-fields";
import { CsvFileMapping } from "../csv-file-mapping/csv-file-mapping";
import { buildCsvPreviewPacket, csvResources as resources } from "./build-csv-preview-packet";
import { useCsvFiles } from "./use-csv-files";
import { useCsvOperation } from "./use-csv-operation";
import { useCsvUploads } from "./use-csv-uploads";
import { useCsvImportPolling } from "./use-csv-import-polling";
import { CsvRecentUploads } from "../csv-recent-uploads/csv-recent-uploads";
import { CsvPreviewPanel } from "../csv-preview-panel/csv-preview-panel";
import { settingsCsvImportCardMessages as englishCopy } from "@/messages/en.json";
import { settingsCsvImportCardMessages as ukrainianCopy } from "@/messages/uk.json";

const initialOptions: CsvOptions = {
  schemaVersion: 1,
  mappingRevision: 1,
  timezone: "Europe/Kyiv",
  catalog: "partial",
  stock: "partial",
  history: null,
  receiptHistory: null,
  discountUnit: "amount",
  policy: {
    statuses: { "5": "SALE", "7": "RETURN" },
    channels: { "1": englishCopy["1Shop"] },
    amounts: {
      price: "gross_unit",
      absoluteDiscount: "line",
      currency: "UAH",
      cost: "unit",
    },
  },
  approved: false,
};
export default function CsvImportCard({
  lang,
  canManage,
}: {
  lang: "uk" | "en";
  canManage: boolean;
}) {
  const labels = csvImportCopy[lang];
  const uk = lang === "uk",
    copy = lang === "uk" ? ukrainianCopy : englishCopy,
    router = useRouter();
  const [options, setOptions] = useState<CsvOptions>(initialOptions),
    [preview, setPreview] = useState<Preview | null>(null),
    [message, setMessage] = useState("");
  const [statusRows, setStatusRows] = useState([
      { code: "5", kind: "SALE" },
      { code: "7", kind: "RETURN" },
    ]),
    [channelRows, setChannelRows] = useState([{ code: "1", name: englishCopy["1Shop"] }]);
  const [receiptRules, setReceiptRules] = useState<CsvReceiptRuleValues>({
    postedStatus: "", supplierCode: "", supplierId: "", costVerified: false,
  });
  const [historyRules, setHistoryRules] = useState<CsvHistoryRuleValues>({
    orders: false, receipts: false, receiptBaseline: false, from: "", to: "",
  });
  const changed = () => {
    setPreview(null);
    setMessage("");
    setOptions((o) => ({ ...o, approved: false }));
  };
  const failure = (e: unknown, resource?: CsvResource) => {
    if (resource && e instanceof CsvError) {
      setMessage(`${names[lang][resource]}: ${copy.row} ${e.row || 1} — ${e.code}`);
      return;
    }
    const code = e instanceof Error ? e.message : "CSV_OPERATION_FAILED";
    setMessage(
      errorCopy[code]?.[uk ? 0 : 1] ??
        copy.operationFailedCheckTheFiles + code,
    );
  };
  const { busy, run } = useCsvOperation(canManage);
  const { files, delimiters, choose, delimiter, mapColumn } = useCsvFiles({
    canManage, busy, run, onChanged: changed, onFailure: failure,
  });
  const messageRef = useRef<HTMLParagraphElement>(null),
    previewRef = useRef<HTMLDivElement>(null);
  const loadedReplacementMode = useRef(false);
  useEffect(() => {
    if (message) messageRef.current?.focus();
  }, [message]);
  useEffect(() => {
    if (preview) previewRef.current?.focus();
  }, [preview?.id]);
  const onUploadsLoaded = useCallback((data: CsvUploadsResponse) => {
    const source = data.source;
    const initial = !loadedReplacementMode.current;
    loadedReplacementMode.current = true;
    if (source) {
      setOptions(options => ({
        ...options,
        timezone: source.timezone,
        ...(initial && source.replacePrevious ? { replacePrevious: true } : {}),
      }));
    }
  }, []);
  const onUploadsError = useCallback(() => {
    setMessage(uk ? ukrainianCopy.couldNotLoadCSVImports : englishCopy.couldNotLoadCSVImports);
  }, [uk]);
  const { source, uploads, suppliers, reload: load } = useCsvUploads(canManage, {
    onLoaded: onUploadsLoaded,
    onInitialError: onUploadsError,
  });
  useEffect(() => {
    if (!Object.keys(files).length || preview) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [files, preview]);
  useCsvImportPolling({
    preview,
    onUpdate: setPreview,
    onActive: async () => {
      router.refresh();
      window.dispatchEvent(new Event("connector-inputs-changed"));
      await load();
    },
    onError: () => setMessage(copy.couldNotRefreshImportStatus),
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      setMessage("");
      const packet = buildCsvPreviewPacket({
        sourceId: source?.sourceId ?? null,
        options,
        files,
        statuses: statusRows,
        channels: channelRows,
        history: historyRules,
        receipts: receiptRules,
      });
      const result = await previewCsvPacket(packet);
      setPreview(result);
      await load();
      window.dispatchEvent(new Event("connector-connection-changed"));
    }, failure);
  }
  async function action(kind: CsvPacketAction) {
    if (!preview) return;
    await run(async () => {
      setMessage("");
      const next = await runCsvPacketAction(preview, kind);
      setPreview(next);
      await load();
      if (next.state === "ACTIVE") {
        router.refresh();
        window.dispatchEvent(new Event("connector-inputs-changed"));
      }
    }, failure);
  }
  async function openUpload(id: string) {
    await run(async () => {
      setPreview(await fetchCsvUpload(id));
    }, failure);
  }
  return (
    <section className="mb-10 space-y-4" aria-labelledby="csv-import-title">
      <div>
        <Heading as="h2" variant="compact" id="csv-import-title" className="text-base">{labels.title}</Heading>
        <Text variant="body" className="mt-1 max-w-3xl leading-normal text-(--muted)">{labels.description}</Text>
      </div>
      {!canManage ? (
        <Text variant="body" className="leading-normal text-(--muted)">{labels.adminOnly}</Text>
      ) : (
        <>
          <form
            autoComplete="off"
            spellCheck={false}
            onSubmit={submit}
            className="space-y-5 rounded-xl border border-(--border) bg-(--surface) p-4 sm:p-5"
          >
            <fieldset disabled={busy} className="space-y-5">
              <legend className="sr-only">
                {copy.importFilesAndRules}
              </legend>
              <CsvPacketSettings
                value={{ timezone: options.timezone, currency: options.policy.amounts.currency, mappingRevision: options.mappingRevision }}
                timezoneLocked={Boolean(source)}
                lang={lang}
                onChange={value => {
                  changed();
                  setOptions(options => ({
                    ...options,
                    timezone: value.timezone,
                    mappingRevision: value.mappingRevision,
                    policy: { ...options.policy, amounts: { ...options.policy.amounts, currency: value.currency } },
                  }));
                }}
              />
              <Note className="leading-normal">{labels.formatHint}</Note>
              {resources.map(resource => (
                <CsvFileMapping
                  key={resource}
                  resource={resource}
                  draft={files[resource]}
                  delimiter={delimiters[resource]}
                  lang={lang}
                  onChoose={choose}
                  onDelimiter={delimiter}
                  onColumnChange={mapColumn}
                />
              ))}
              <CsvPopulationRules
                value={{ catalog: options.catalog, stock: options.stock }}
                lang={lang}
                onChange={value => {
                  changed();
                  setOptions(options => ({ ...options, ...value }));
                }}
              />
              <StatusMappingFields
                rows={statusRows.map(row => ({ id: row.code, kind: row.kind }))}
                lang={lang}
                config={csvStatusMappingConfig}
                onChange={rows => {
                  changed();
                  setStatusRows(rows.map(row => ({ code: row.id, kind: row.kind })));
                }}
              />
              <ChannelMappingFields
                legend={uk ? ukrainianCopy.legendSalesChannels : englishCopy.legendSalesChannels}
                nameLabel={uk ? ukrainianCopy.nameLabelChannelName : englishCopy.nameLabelChannelName}
                rows={channelRows}
                lang={lang}
                onChange={rows => {
                  changed();
                  setChannelRows(rows);
                }}
              />
              <CsvAmountRules
                value={{
                  price: options.policy.amounts.price,
                  discountUnit: options.discountUnit,
                  absoluteDiscount: options.policy.amounts.absoluteDiscount,
                }}
                lang={lang}
                onChange={rules => {
                  changed();
                  setOptions(options => ({
                    ...options,
                    discountUnit: rules.discountUnit,
                    policy: {
                      ...options.policy,
                      amounts: {
                        ...options.policy.amounts,
                        price: rules.price,
                        absoluteDiscount: rules.absoluteDiscount,
                      },
                    },
                  }));
                }}
              />
              {files.receipts && (
                <CsvReceiptRules
                  value={receiptRules}
                  suppliers={suppliers}
                  lang={lang}
                  onChange={value => {
                    changed();
                    setReceiptRules(value);
                  }}
                />
              )}
              <CsvHistoryRules
                value={historyRules}
                lang={lang}
                onChange={value => {
                  changed();
                  setHistoryRules(value);
                }}
              />
              <div>
                <label className="flex min-h-12 items-center gap-2 text-sm text-(--text)">
                  <input
                    type="checkbox"
                    name="replacePrevious"
                    aria-describedby="csv-replacement-hint"
                    checked={options.replacePrevious === true}
                    onChange={event => {
                      const replacePrevious = event.target.checked;
                      changed();
                      setOptions(previous => ({ ...previous, replacePrevious }));
                    }}
                  />
                  {labels.replacePrevious}
                </label>
                <p id="csv-replacement-hint" className="text-sm text-(--muted)">{labels.replacePreviousHelp}</p>
              </div>
              <CsvImportConfirmation
                approved={options.approved}
                busy={busy}
                hasFiles={Object.keys(files).length > 0}
                lang={lang}
                onApprove={approved => {
                  setPreview(null);
                  setOptions(options => ({ ...options, approved }));
                }}
              />
            </fieldset>
          </form>
          {message && (
            <p
              ref={messageRef}
              tabIndex={-1}
              role="alert"
              className="wrap-break-word text-sm text-(--text)"
            >
              {message}
            </p>
          )}
          {preview && (
            <CsvPreviewPanel
              preview={preview}
              lang={lang}
              busy={busy}
              suppliers={suppliers}
              panelRef={previewRef}
              onAction={action}
            />
          )}
          <CsvRecentUploads uploads={uploads} busy={busy} lang={lang} onOpen={openUpload} />
        </>
      )}
    </section>
  );
}
