"use client";

import { ScenarioWorkspaceFrame } from "@/components/merchandising/scenario-workspace-frame/scenario-workspace-frame";
import { repricingCopy } from "@/lib/repricing-copy";
import RepricingEditor from "../repricing-editor/repricing-editor";

export default function RepricingWorkspace() {
  return (
    <ScenarioWorkspaceFrame screen="repricing" translations={repricingCopy}>
      {({ snapshotId, monobrand, lang, onRefresh }) => (
        <RepricingEditor key={snapshotId} snapshotId={snapshotId} monobrand={monobrand} lang={lang} onRefresh={onRefresh} />
      )}
    </ScenarioWorkspaceFrame>
  );
}
