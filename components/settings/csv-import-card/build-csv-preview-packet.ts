import { CSV_FIELDS, type CsvOptions, type CsvResource } from "@/lib/connectors/csv/schema";
import type { CsvFileDraft, CsvChannelRow } from "./csv-import-types";
import type { CsvHistoryRuleValues } from "../csv-history-rules/csv-history-rules";
import type { CsvReceiptRuleValues } from "../csv-receipt-rules/csv-receipt-rules";

export const csvResources = Object.keys(CSV_FIELDS) as CsvResource[];

export function buildCsvPreviewPacket({ sourceId, options, files, statuses, channels, history, receipts }: {
  sourceId: string | null;
  options: CsvOptions;
  files: Partial<Record<CsvResource, CsvFileDraft>>;
  statuses: Array<{ code: string; kind: string }>;
  channels: CsvChannelRow[];
  history: CsvHistoryRuleValues;
  receipts: CsvReceiptRuleValues;
}) {
  if (new Set(statuses.map(row => row.code)).size !== statuses.length ||
      new Set(channels.map(row => row.code)).size !== channels.length) {
    throw new Error("DUPLICATE_MAPPING");
  }
  const { replacePrevious, ...otherOptions } = options;
  const packetOptions: CsvOptions = {
    ...otherOptions,
    ...(replacePrevious ? { replacePrevious } : {}),
    history: history.orders ? { from: history.from, to: history.to, complete: true } : null,
    receiptHistory: history.receipts ? { from: history.from, to: history.to, complete: true } : null,
    receiptBaseline: history.receipts && history.receiptBaseline,
    policy: {
      ...options.policy,
      statuses: Object.fromEntries(statuses.map(row => [row.code, row.kind])) as CsvOptions["policy"]["statuses"],
      channels: Object.fromEntries(channels.map(row => [row.code, row.name])),
      ...(files.receipts ? {
        receipts: {
          postedStatuses: [receipts.postedStatus],
          suppliers: { [receipts.supplierCode]: receipts.supplierId },
          productIdField: "id" as const,
          currency: options.policy.amounts.currency,
          unitCostVerified: receipts.costVerified,
        },
      } : {}),
    },
  };
  return {
    sourceId,
    options: packetOptions,
    files: csvResources.flatMap(resource => files[resource] ? [files[resource]!.file] : []),
  };
}
