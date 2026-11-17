import type { OverviewCopy } from "@/lib/overview-copy";
import type { CurrencyBlock } from "./overview-types";

export const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");

export function overviewBottleneckName(
  bottleneck: NonNullable<CurrencyBlock["bottleneck"]>,
  monobrand: boolean,
  copy: Pick<OverviewCopy, "unknownCategory" | "unknownBrand">,
): string {
  const groupId = monobrand ? bottleneck.categoryId : bottleneck.brandId;
  const unknownGroup = monobrand ? copy.unknownCategory : copy.unknownBrand;
  return groupId === null ? unknownGroup : bottleneck.name;
}
