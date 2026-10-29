import { readSelectedSource } from "./connectors/source";
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SqlDatabase } from "./connectors/database";
import { withCalculationSnapshot } from "./calculation-snapshot";
import { readClientSettings } from "./merchandising-settings-store";
export interface NavigationOptions {
  monobrand: boolean;
  channels: Array<{ id: string }>;
  truncated: boolean;
}
/** Read tenant-owned navigation choices without calculating reports or exposing connector credentials. */
export async function readNavigationOptions(
  tenantId: string,
  db: SqlDatabase = prisma,
): Promise<NavigationOptions> {
  return withCalculationSnapshot(db, async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
    const [settings,selected] = await Promise.all([readClientSettings(tenantId, tx),readSelectedSource(tenantId,tx)]);
    const channels = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT DISTINCT COALESCE(l."channelId",'__unassigned__') id FROM "OrderLine" l
      WHERE l."tenantId"=${tenantId} AND l."sourceId"=${selected?.id??null}
      ${settings.values.excludedChannels.length ? Prisma.sql`AND (l."channelId" IS NULL OR l."channelId" NOT IN (${Prisma.join(settings.values.excludedChannels)}))` : Prisma.empty}
      ORDER BY id LIMIT 201`);
    return {
      monobrand: settings.values.profileMode === "MONOBRAND",
      channels: channels.slice(0, 200),
      truncated: channels.length > 200,
    };
  });
}
