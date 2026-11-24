import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { readPublicationData, withPublicationDatabase } from "./merchandising-publication-data";
import type { SqlDatabase } from "./connectors/database";
import { readSelectedSource } from "./connectors/source";
import { getMerchandisingScreen } from "./merchandising-screen";
import { createScreenSnapshot, ScreenApiError } from "./merchandising-snapshot";
import {
  parseScreenQuery,
  SCREEN_NAMES,
  type ScreenName,
  type ScreenQuery,
} from "./merchandising-screen-query";
import {
  readNavigationOptions,
  type NavigationOptions,
} from "./merchandising-navigation-store";
import { parseRepricingRequest, REPRICING_CALCULATION_VERSION } from "./repricing";
import { parseReorderingRequest } from "./reorder-calc";
import { createRepricingInputs, getRepricingPreview } from "./repricing-store";
import { getReorderingPreview } from "./reordering-store";
import type { RepricingRequest } from "./repricing-contract";
import type { ReorderingRequest } from "./reordering-contract";
import type { ReportPublicationStorage } from "./merchandising-publication-storage";
import { workspaceReportStorage } from "./workspace-report-storage";

type ScreenResponse = Awaited<ReturnType<typeof getMerchandisingScreen>>;

interface ReportPublicationVersion {
  version: string;
  snapshotId: string;
  dateFrom: string;
  dateTo: string;
  asOf: string;
  publishedAt: string;
  navigation: NavigationOptions;
  repricingInputSetId: string;
  dataVersion?: 1;
  agentSource?: { importRunId: string; reportSourceId: string };
}

export interface ReportPublication extends ReportPublicationVersion {
  previous?: ReportPublicationVersion;
}

function publicationPath(tenantId: string) {
  const tenant = createHash("sha256").update(tenantId).digest("hex");
  return `merchandising/v1/${tenant}`;
}

function manifestPath(tenantId: string) {
  return `${publicationPath(tenantId)}/active.json`;
}

async function readManifest(tenantId: string, storage: ReportPublicationStorage) {
  const file = await storage.read(manifestPath(tenantId));
  if (!file) return null;
  const publication = JSON.parse(file.text) as ReportPublication;
  const validVersion = /^[a-f0-9-]{36}$/;
  if (!validVersion.test(publication.version) ||
      (publication.previous && !validVersion.test(publication.previous.version)))
    throw new Error("Invalid report publication version");
  return { publication, revision: file.revision };
}

export async function readReportPublication(tenantId: string, storage: ReportPublicationStorage) {
  return (await readManifest(tenantId, storage))?.publication ?? null;
}

export async function readWorkspacePublication(tenantId: string) {
  const storage = await workspaceReportStorage(tenantId);
  return storage && await readReportPublication(tenantId, storage);
}

function standardQuery(screen: ScreenName, snapshotId: string, monobrand: boolean) {
  const params = new URLSearchParams({ snapshotId });
  if (screen === "sales") params.set("groupBy", monobrand ? "category" : "brand");
  if (screen === "stock") {
    params.set("groupBy", "category");
    params.set("sort", "stockCost");
    params.set("direction", "desc");
  }
  return parseScreenQuery(params, screen);
}

type ScenarioFiles = {
  "repricing-inputs": Awaited<ReturnType<typeof createRepricingInputs>>;
  "repricing-preview": Awaited<ReturnType<typeof getRepricingPreview>>;
  "reordering-preview": Awaited<ReturnType<typeof getReorderingPreview>>;
};

function versionPath(tenantId: string, version: string, part: ScreenName | keyof ScenarioFiles | "data") {
  return `${publicationPath(tenantId)}/${version}/${part}.json`;
}

function decodeScreen(text: string, screen: ScreenName, snapshotId: string) {
  const data = JSON.parse(text) as ScreenResponse;
  if (data?.screen !== screen || data?.context?.snapshotId !== snapshotId)
    throw new Error("Invalid published screen response");
  return data;
}

async function readVersionFile<T>(
  path: string,
  storage: ReportPublicationStorage,
  decode: (text: string) => T,
) {
  let cache = storage.cache;
  if (cache) {
    let cached: string | null = null;
    try {
      cached = await cache.read(path);
    } catch {
      // Avoid a second network timeout if Redis failed to answer the read.
      cache = undefined;
    }
    if (cached) {
      try {
        return decode(cached);
      } catch {
        // Refill an invalid key from the authoritative private copy.
      }
    }
  }
  const stored = await storage.read(path);
  if (!stored) throw new ScreenApiError("PUBLISHED_SCREEN_UNAVAILABLE", 503);
  const data = decode(stored.text);
  // Keep REST requests below the smallest Upstash request limit after JSON escaping.
  if (cache && Buffer.byteLength(JSON.stringify(stored.text)) <= 768 * 1024)
    await cache.write(path, stored.text).catch(() => null);
  return data;
}

function findPublishedVersion(
  active: ReportPublication | null,
  key: "snapshotId" | "repricingInputSetId",
  value: string,
) {
  if (active?.[key] === value) return active;
  if (active?.previous?.[key] === value) return active.previous;
  return null;
}

async function withPublishedInputs<T>(
  tenantId: string,
  publication: ReportPublicationVersion,
  storage: ReportPublicationStorage,
  run: (db: SqlDatabase) => Promise<T>,
): Promise<T | null> {
  if (publication.dataVersion !== 1) return null;
  const text = await readVersionFile(
    versionPath(tenantId, publication.version, "data"), storage, (value) => value,
  );
  return withPublicationDatabase(text, run);
}

export async function withPublishedScenarioInputs<T>(
  tenantId: string,
  selection: { snapshotId: string } | { inputSetId: string },
  storage: ReportPublicationStorage,
  run: (db: SqlDatabase) => Promise<T>,
): Promise<T | null> {
  const active = await readReportPublication(tenantId, storage);
  const publication = "snapshotId" in selection
    ? findPublishedVersion(active, "snapshotId", selection.snapshotId)
    : findPublishedVersion(active, "repricingInputSetId", selection.inputSetId);
  return publication ? withPublishedInputs(tenantId, publication, storage, run) : null;
}

export async function readPublishedScreen(
  tenantId: string,
  screen: ScreenName,
  query: ScreenQuery,
  storage: ReportPublicationStorage,
) {
  const publication = findPublishedVersion(
    await readReportPublication(tenantId, storage), "snapshotId", query.snapshotId,
  );
  if (!publication) return null;
  const standard = standardQuery(screen, query.snapshotId, publication.navigation.monobrand);
  if (JSON.stringify(query) !== JSON.stringify(standard)) {
    const filtered = await withPublishedInputs(tenantId, publication, storage, (db) =>
      getMerchandisingScreen(tenantId, screen, query, db, new Date(publication.publishedAt), { published: true }),
    );
    return filtered && { ...filtered, publishedAt: publication.publishedAt };
  }

  const data = await readVersionFile(
    versionPath(tenantId, publication.version, screen),
    storage,
    (text) => decodeScreen(text, screen, query.snapshotId),
  );
  return { ...data, publishedAt: publication.publishedAt };
}

async function readScenarioFile<K extends keyof ScenarioFiles>(
  tenantId: string,
  publication: ReportPublicationVersion,
  kind: K,
  storage: ReportPublicationStorage,
) {
  return readVersionFile(versionPath(tenantId, publication.version, kind), storage, (text) => {
    const data = JSON.parse(text) as ScenarioFiles[K];
    if (data.snapshotId !== publication.snapshotId)
      throw new Error("Invalid published scenario response");
    return data;
  });
}

export async function readPublishedRepricingInputs(
  tenantId: string,
  snapshotId: string,
  storage: ReportPublicationStorage,
) {
  const publication = findPublishedVersion(
    await readReportPublication(tenantId, storage), "snapshotId", snapshotId,
  );
  if (!publication) return null;
  return readScenarioFile(tenantId, publication, "repricing-inputs", storage);
}

export async function readPublishedRepricingPreview(
  tenantId: string,
  request: RepricingRequest,
  storage: ReportPublicationStorage,
) {
  const publication = findPublishedVersion(
    await readReportPublication(tenantId, storage), "repricingInputSetId", request.inputSetId,
  );
  if (!publication) return null;
  if (JSON.stringify(request) === JSON.stringify(parseRepricingRequest({ inputSetId: request.inputSetId }))) {
    const cached = await readScenarioFile(tenantId, publication, "repricing-preview", storage);
    if (cached.calculationVersion === REPRICING_CALCULATION_VERSION || publication.dataVersion !== 1)
      return cached;
  }
  return withPublishedInputs(tenantId, publication, storage, (db) =>
    getRepricingPreview(tenantId, request, db, { published: true }),
  );
}

export async function readPublishedReorderingPreview(
  tenantId: string,
  request: ReorderingRequest,
  storage: ReportPublicationStorage,
) {
  const publication = findPublishedVersion(
    await readReportPublication(tenantId, storage), "snapshotId", request.snapshotId,
  );
  if (!publication) return null;
  if (JSON.stringify(request) === JSON.stringify(parseReorderingRequest({ snapshotId: request.snapshotId })))
    return readScenarioFile(tenantId, publication, "reordering-preview", storage);
  return withPublishedInputs(tenantId, publication, storage, (db) =>
    getReorderingPreview(tenantId, request, db, { published: true }),
  );
}

export async function publishMerchandisingReports(
  tenantId: string,
  input: { dateFrom: string; dateTo: string; asOf?: string },
  storage: ReportPublicationStorage,
  db: SqlDatabase = prisma,
  options: { firstOnly?: boolean; expectedSourceId?: string } = {},
) {
  const previous = await readManifest(tenantId, storage);
  if (options.firstOnly && previous) return previous.publication;
  const expectedSourceId = options.expectedSourceId ?? previous?.publication.agentSource?.reportSourceId;
  if (expectedSourceId && (await readSelectedSource(tenantId, db))?.id !== expectedSourceId)
    throw new ScreenApiError("PUBLISHED_SOURCE_CHANGED");
  const snapshot = await createScreenSnapshot(
    tenantId,
    { ...input, asOf: input.asOf ?? input.dateTo },
    db,
  );
  if (expectedSourceId && snapshot.sourceId !== expectedSourceId)
    throw new ScreenApiError("PUBLISHED_SOURCE_CHANGED");
  if (previous?.publication.dataVersion === 1 && snapshot.snapshotId === previous.publication.snapshotId)
    return previous.publication;
  const version = randomUUID();
  const monobrand = snapshot.sales.context.settings.profileMode === "MONOBRAND";
  if (!snapshot.sales.context.history.current)
    throw new ScreenApiError("PUBLISHED_DATE_INCOMPLETE");
  const inputs = await createRepricingInputs(tenantId, snapshot.snapshotId, db);
  const navigation = await readNavigationOptions(tenantId, db);
  if (navigation.monobrand !== monobrand)
    throw new ScreenApiError("PUBLISHED_SOURCE_CHANGED");
  const inputData = await readPublicationData(tenantId, snapshot, inputs.inputSetId, db);
  const publishedAt = new Date();
  const responses = await withPublicationDatabase(inputData, async (publishedDb) => {
    const files: Array<[ScreenName | keyof ScenarioFiles | "data", string]> = [];
    for (const screen of SCREEN_NAMES) {
      const data = await getMerchandisingScreen(
        tenantId, screen, standardQuery(screen, snapshot.snapshotId, monobrand),
        publishedDb, publishedAt, { published: true },
      );
      if (screen === "overview" && !data.stock?.summary.byCurrency.some((row) => row.quantity !== null))
        throw new ScreenApiError("PUBLISHED_DATE_INCOMPLETE");
      files.push([screen, JSON.stringify(data)]);
    }
    const repricing = await getRepricingPreview(
      tenantId, { inputSetId: inputs.inputSetId }, publishedDb, { published: true },
    );
    const reordering = await getReorderingPreview(
      tenantId, { snapshotId: snapshot.snapshotId }, publishedDb, { published: true },
    );
    return [
      ...files,
      ["repricing-inputs", JSON.stringify(inputs)],
      ["repricing-preview", JSON.stringify(repricing)],
      ["reordering-preview", JSON.stringify(reordering)],
      ["data", inputData],
    ] satisfies typeof files;
  });
  await Promise.all(responses.map(([name, text]) => storage.write(versionPath(tenantId, version, name), text)));
  const publication: ReportPublication = {
    version,
    snapshotId: snapshot.snapshotId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    asOf: snapshot.stock.asOf,
    publishedAt: publishedAt.toISOString(),
    navigation,
    repricingInputSetId: inputs.inputSetId,
    dataVersion: 1,
    ...(previous?.publication.agentSource?.reportSourceId === snapshot.sourceId
      ? { agentSource: previous.publication.agentSource }
      : {}),
  };
  if (previous) {
    const { previous: _history, ...priorVersion } = previous.publication;
    publication.previous = priorVersion;
  }
  if (await storage.publish(manifestPath(tenantId), JSON.stringify(publication), previous?.revision ?? null))
    return publication;

  const winner = await readReportPublication(tenantId, storage);
  if (winner && (options.firstOnly ||
      (winner.dataVersion === publication.dataVersion && winner.snapshotId === publication.snapshotId)))
    return winner;
  throw new ScreenApiError("PUBLICATION_CONFLICT");
}
