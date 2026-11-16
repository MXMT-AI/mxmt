import { merchandisingGroup } from "@/lib/merchandising-navigation";
import { readScreenControls } from "@/lib/client/merchandising-screen-request";

export function salesWorkspaceControls(params: URLSearchParams, monobrand: boolean): Record<string, string> {
  return {
    ...readScreenControls("sales", params),
    groupBy: merchandisingGroup(params, monobrand),
  };
}
