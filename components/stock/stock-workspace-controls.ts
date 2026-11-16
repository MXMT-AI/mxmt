import { readScreenControls } from "@/lib/client/merchandising-screen-request";

export function stockWorkspaceControls(params: Pick<URLSearchParams, "get">): Record<string, string> {
  return {
    ...readScreenControls("stock", params),
    groupBy: params.get("groupBy") === "sku" ? "sku" : "category",
    sort: params.get("sort") ?? "stockCost",
    direction: params.get("direction") ?? "desc",
  };
}
