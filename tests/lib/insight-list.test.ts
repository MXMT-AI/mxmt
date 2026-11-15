import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightList } from "@/components/agents/insight-list/insight-list";
import { buildCategoryInsightRows, buildChannelInsightRows } from "@/components/agents/insight-list/insight-rows";

describe("agent insight lists", () => {
  it("shows STOCKOUT in both views with the information color only in the dialog", () => {
    const categories = [{ category: "Outerwear", status: "stockout" }];

    const card = renderToStaticMarkup(createElement(InsightList, {
      rows: buildCategoryInsightRows(categories, "card"),
    }));
    const dialog = renderToStaticMarkup(createElement(InsightList, {
      rows: buildCategoryInsightRows(categories, "dialog"),
      variant: "dialog",
    }));

    expect(card).toContain("STOCKOUT");
    expect(card).not.toContain("var(--info-ink)");
    expect(dialog).toContain("STOCKOUT");
    expect(dialog).toContain("color:var(--info-ink)");
  });

  it("uses the attribute as a fallback and defaults missing category status only in the card", () => {
    const categories = [{ category: "", attribute: "Fabric", insight: "Sample result" }];

    expect(buildCategoryInsightRows(categories, "card")[0]).toMatchObject({
      title: "Fabric", status: "normal", insight: "Sample result",
    });
    expect(buildCategoryInsightRows(categories, "dialog")[0]).toMatchObject({
      title: "Fabric", status: undefined, insight: "Sample result",
    });
  });

  it("keeps missing channel status empty and styles an inactive channel as a warning", () => {
    const channels = [{ channel: "retail" }, { channel: "wholesale", status: "inactive" }];

    const cardRows = buildChannelInsightRows(channels, "card");
    const dialogRows = buildChannelInsightRows(channels, "dialog");

    expect(cardRows[0].status).toBeUndefined();
    expect(dialogRows[0].status).toBeUndefined();
    expect(cardRows[1].tone).toBe("warning");
    expect(dialogRows[1].color).toBe("var(--amber-ink)");
  });
});
