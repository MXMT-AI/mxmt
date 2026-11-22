"use client";

import { useRef, useState, type FormEvent } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { Dialog } from "@/components/ui/dialog/dialog";
import { Text } from "@/components/ui/text/text";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { RecommendationChannel } from "@/lib/calendar-recommendation-approval";
import { agentsRecommendationApprovalModalMessages as englishCopy } from "@/messages/en.json";
import { agentsRecommendationApprovalModalMessages as ukrainianCopy } from "@/messages/uk.json";

export type ApprovalRecommendation = {
  recommendation_id: string;
  brand_id: string;
  brand_name: string;
  decision_summary: string;
  channels: RecommendationChannel[];
  status?: "draft" | "scheduled";
};

const CHANNEL_LABELS: Record<RecommendationChannel, string> = {
  website: ukrainianCopy.websiteСайт,
  smm: ukrainianCopy.smmСоцмережі,
  email: englishCopy.email,
  ads: ukrainianCopy.adsРеклама,
  store: ukrainianCopy.storeМагазин,
  marketplace: ukrainianCopy.marketplaceМаркетплейси,
  general: ukrainianCopy.generalЗагальнийПлан,
};

export default function RecommendationApprovalModal({
  calendarRunId,
  recommendation,
  weekKeys,
  onClose,
  onApproved,
}: {
  calendarRunId: string;
  recommendation: ApprovalRecommendation;
  weekKeys: string[];
  onClose: () => void;
  onApproved: () => void | Promise<void>;
}) {
  const availableChannels = recommendation.channels.length > 0 ? recommendation.channels : ["general" as const];
  const [weekKey, setWeekKey] = useState(weekKeys[0] ?? "");
  const [channels, setChannels] = useState<RecommendationChannel[]>(availableChannels);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const toggleChannel = (channel: RecommendationChannel) => {
    setChannels((current) => current.includes(channel)
      ? current.filter((item) => item !== channel)
      : [...current, channel]);
  };

  const canApprove = weekKeys.includes(weekKey) && channels.length > 0;

  function requestClose() {
    if (!inFlight.current) onClose();
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canApprove || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch("/api/agents/calendar-agent/recommendations/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarRunId,
          recommendationId: recommendation.recommendation_id,
          weekKey,
          channels,
        }),
      });
      const body = await readApiJson<{ ok?: boolean; error?: string }>(response);
      if (!response.ok || body?.ok !== true) {
        throw new Error(body?.error ?? ukrainianCopy.errorНеВдалосяПогодитиРекомендацію);
      }
      await onApproved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ukrainianCopy.errorНеВдалосяПогодитиРекомендацію);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={recommendation.brand_name}
      subtitle={ukrainianCopy.subtitleПогодженняПлану}
      closeLabel={ukrainianCopy.closeLabelЗакрити}
      closeDisabled={saving}
      onClose={requestClose}
      className="max-w-lg"
    >
      <form onSubmit={approve} aria-busy={saving}>
        <div className="space-y-5 p-5">
          <Text variant="body">{recommendation.decision_summary}</Text>
          <label className="block">
            <span className="mb-2 block text-[10px] font-mono uppercase tracking-wider text-(--subtle)">{ukrainianCopy.тижденьЗапуску}</span>
            <select
              value={weekKeys.includes(weekKey) ? weekKey : ""}
              disabled={saving || weekKeys.length === 0}
              required
              onChange={(event) => setWeekKey(event.target.value)}
              className="w-full rounded-lg border border-(--border) bg-(--input-bg) px-3 py-2 text-sm text-(--text) focus:border-accent-yellow/50 focus:outline-hidden"
            >
              {!weekKeys.includes(weekKey) && <option value="">{ukrainianCopy.немаєВибраногоТижня}</option>}
              {weekKeys.map((key) => <option key={key} value={key}>{ukrainianCopy.тиждень}{key.slice(1)}</option>)}
            </select>
          </label>

          <fieldset disabled={saving}>
            <legend className="mb-2 text-[10px] font-mono uppercase tracking-wider text-(--subtle)">{ukrainianCopy.канали}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {availableChannels.map((channel) => (
                <label key={channel} className="flex cursor-pointer items-center gap-2 rounded-lg border border-(--border) bg-(--input-bg) px-3 py-2 text-sm text-(--text)">
                  <input
                    type="checkbox"
                    checked={channels.includes(channel)}
                    onChange={() => toggleChannel(channel)}
                    className="accent-accent-yellow"
                  />
                  {CHANNEL_LABELS[channel]}
                </label>
              ))}
            </div>
          </fieldset>

          {availableChannels.includes("ads") && (
            <p className="rounded-lg border border-accent-yellow/20 bg-accent-yellow/5 px-3 py-2 text-[11px] text-accent-yellow">{ukrainianCopy.рекламнийБюджетПотребуєОкремогоПогодження}</p>
          )}
          {error && <p role="alert" className="text-xs text-accent-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-(--border) p-5">
          <Button onClick={requestClose} disabled={saving} className="px-4 py-2 font-sans text-xs">{ukrainianCopy.скасувати}</Button>
          <Button
            type="submit"
            disabled={saving || !canApprove}
            className="gap-2 border-accent-yellow/40 bg-accent-yellow/15 px-4 py-2 font-sans text-xs font-semibold text-accent-yellow hover:bg-accent-yellow/20 hover:text-accent-yellow"
          >
            <CalendarPlus size={14} aria-hidden="true" />
            {saving ? ukrainianCopy.додаємо : ukrainianCopy.погодитиЙДодати}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
