import { beforeEach, expect, it, vi } from "vitest";
import { OverviewChatPanel } from "@/components/overview/overview-chat-panel/overview-chat-panel";
import { readOverviewChatParams } from "@/components/overview/overview-chat-params";
import OverviewWorkspace from "@/components/overview/overview-workspace/overview-workspace";
const state = vi.hoisted(() => ({
  query: "snapshotId=pinned&channelId=2&currency=UAH", replace: vi.fn(),
  loaded: undefined as boolean | undefined, busy: false,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null, useRouter: () => ({ replace: state.replace }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: (initial: boolean) => {
  state.loaded ??= initial;
  return [state.loaded, (value: boolean) => { state.loaded = value; }];
} }));
vi.mock("@/components/language-provider/language-provider", () => ({ useLang: () => ({ lang: "en" }) }));
vi.mock("@/components/merchandising/merchandising-shell/merchandising-shell", () => ({ useMerchandisingFilters: () => ({}), useScenarioExportPermission: () => false }));
vi.mock("@/components/merchandising/use-merchandising-screen", () => ({ useMerchandisingScreen: () => ({ busy: state.busy, error: "", refresh: vi.fn(), data: { context: { snapshotId: "pinned", profileMode: "MONOBRAND" }, readiness: {} } }) }));
const onLoad = vi.fn();
const props = { snapshotId: "pinned", lang: "en" as const, allowed: false, loaded: false, onLoad };
beforeEach(() => {
  state.query = "snapshotId=pinned&channelId=2&currency=UAH";
  state.loaded = undefined; state.busy = false;
  vi.clearAllMocks();
});
it("loads on first opening and preserves report query parameters", () => {
  const panel = OverviewChatPanel(props);
  expect(panel.props.open).toBe(false);
  expect(panel.props.children[1]).toBeNull();
  panel.props.onToggle!({ currentTarget: { open: true } } as never);
  expect(onLoad).toHaveBeenCalledOnce();
  expect(state.replace).toHaveBeenCalledWith("/overview?snapshotId=pinned&channelId=2&currency=UAH&chat=1", { scroll: false });
});
it("closes without removing the topic, export or report context", () => {
  state.query += "&chat=1&chatTopic=repricing&chatExportId=export";
  const panel = OverviewChatPanel({ ...props, loaded: true });
  expect(panel.props.open).toBe(true);
  panel.props.onToggle!({ currentTarget: { open: false } } as never);
  expect(state.replace).toHaveBeenCalledWith("/overview?snapshotId=pinned&channelId=2&currency=UAH&chatTopic=repricing&chatExportId=export", { scroll: false });
  expect(onLoad).not.toHaveBeenCalled();
});
it("does not navigate when the toggle matches the URL and forwards viewer access", () => {
  state.query += "&chat=1";
  const panel = OverviewChatPanel({ ...props, loaded: true });
  panel.props.onToggle!({ currentTarget: { open: true } } as never);
  expect(state.replace).not.toHaveBeenCalled();
  const chat = panel.props.children[1];
  expect(chat && chat.props.allowed).toBe(false);
  expect(chat && chat.props.snapshotId).toBe("pinned");
});
it("reads supported filters, retains empty values and ignores unknown topics", () => {
  const chat = readOverviewChatParams(new URLSearchParams("brandId=b&search=&chatTopic=invalid&chatExportId=export&unexpected=secret"), "pinned");
  expect(chat.filters).toEqual({ brandId: "b", search: "" });
  expect(chat.initialTopic).toBeUndefined();
  expect(chat.scenarioExportId).toBe("export");
});
it.each(["snapshot", "filters", "topic", "export"])("changes the dialog key when %s changes", change => {
  const query = new URLSearchParams("brandId=b&chatTopic=stock&chatExportId=e");
  const before = readOverviewChatParams(query, "pinned");
  if (change === "filters") query.set("brandId", "new");
  if (change === "topic") query.set("chatTopic", "sales");
  if (change === "export") query.set("chatExportId", "new");
  const after = readOverviewChatParams(query, change === "snapshot" ? "new" : "pinned");
  expect(after.scope).not.toBe(before.scope);
});
it("keeps an activated chat loaded across report refreshes", () => {
  const workspace = OverviewWorkspace();
  const chat = workspace.props.children[2];
  expect(chat.type).toBe(OverviewChatPanel);
  expect(chat.props.loaded).toBe(false);
  chat.props.onLoad();
  state.busy = true;
  expect(OverviewWorkspace().props.role).toBe("status");
  state.busy = false;
  expect(OverviewWorkspace().props.children[2].props.loaded).toBe(true);
});
it("initializes chat loading from a direct chat URL", () => {
  state.query += "&chat=1";
  expect(OverviewWorkspace().props.children[2].props.loaded).toBe(true);
});
