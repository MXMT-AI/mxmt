"use client";

import { useState } from "react";
import { CalendarPlus, X } from "lucide-react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { RecommendationChannel } from "@/lib/calendar-recommendation-approval";

export type ApprovalRecommendation = {
  recommendation_id: string;
  brand_id: string;
  brand_name: string;
  decision_summary: string;
  channels: RecommendationChannel[];
  status?: "draft" | "scheduled";
};

const CHANNEL_LABELS: Record<RecommendationChannel, string> = {
  website: "Сайт",
  smm: "Соцмережі",
  email: "Email / SMS",
  ads: "Реклама",
  store: "Магазин",
  marketplace: "Маркетплейси",
  general: "Загальний план",
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
  const [error, setError] = useState<string | null>(null);

  const toggleChannel = (channel: RecommendationChannel) => {
    setChannels((current) => current.includes(channel)
      ? current.filter((item) => item !== channel)
      : [...current, channel]);
  };

  const approve = async () => {
    if (!weekKey || channels.length === 0 || saving) return;
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
      const body = await readApiJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error ?? "Не вдалося погодити рекомендацію");
      await onApproved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не вдалося погодити рекомендацію");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        className="w-full max-w-lg rounded-2xl border border-(--border) bg-(--surface) shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-(--border) p-5">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-accent-yellow">Погодження плану</p>
            <h2 id="approval-title" className="mt-1 text-lg font-semibold text-(--text)">
              {recommendation.brand_name}
            </h2>
            <p className="mt-1 text-sm text-(--muted)">{recommendation.decision_summary}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрити" className="rounded-lg p-1.5 text-(--muted) hover:bg-(--input-bg) hover:text-(--text)">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <label className="block">
            <span className="mb-2 block text-[10px] font-mono uppercase tracking-wider text-(--subtle)">Тиждень запуску</span>
            <select
              value={weekKey}
              onChange={(event) => setWeekKey(event.target.value)}
              className="w-full rounded-lg border border-(--border) bg-(--input-bg) px-3 py-2 text-sm text-(--text) focus:border-accent-yellow/50 focus:outline-hidden"
            >
              {weekKeys.map((key) => <option key={key} value={key}>Тиждень {key.slice(1)}</option>)}
            </select>
          </label>

          <fieldset>
            <legend className="mb-2 text-[10px] font-mono uppercase tracking-wider text-(--subtle)">Канали</legend>
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
            <p className="rounded-lg border border-accent-yellow/20 bg-accent-yellow/5 px-3 py-2 text-[11px] text-accent-yellow">
              Рекламний бюджет потребує окремого погодження PM.
            </p>
          )}
          {error && <p role="alert" className="text-xs text-[#ef4444]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-(--border) p-5">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-(--border) px-4 py-2 text-xs text-(--muted) hover:bg-(--input-bg)">
            Скасувати
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={saving || !weekKey || channels.length === 0}
            className="flex items-center gap-2 rounded-lg border border-accent-yellow/40 bg-accent-yellow/15 px-4 py-2 text-xs font-semibold text-accent-yellow disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CalendarPlus size={14} aria-hidden="true" />
            {saving ? "Додаємо…" : "Погодити й додати"}
          </button>
        </div>
      </div>
    </div>
  );
}
