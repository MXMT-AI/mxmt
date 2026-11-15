"use client";

import type { RepricingDraft } from "@/lib/repricing-workspace";
import type { RepricingCopy } from "@/lib/repricing-copy";
import type { RepricingPreview, RepricingFailure } from "../use-repricing-preview";
import { RepricingFilters } from "../repricing-filters/repricing-filters";
import { RepricingParameters } from "../repricing-parameters/repricing-parameters";

export default function RepricingControls({
  monobrand = false,
  draft,
  onChange,
  data,
  error,
  copy,
}: {
  monobrand?: boolean;
  draft: RepricingDraft;
  onChange: (draft: RepricingDraft) => void;
  data: RepricingPreview | null;
  error: RepricingFailure | null;
  copy: RepricingCopy;
}) {
  return (
    <>
      <RepricingFilters monobrand={monobrand} draft={draft} onChange={onChange} data={data} error={error} copy={copy} />
      <RepricingParameters draft={draft} onChange={onChange} error={error} copy={copy} />
    </>
  );
}
