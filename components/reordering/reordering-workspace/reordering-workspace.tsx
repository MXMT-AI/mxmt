"use client";

import { ScenarioWorkspaceFrame } from "@/components/merchandising/scenario-workspace-frame/scenario-workspace-frame";
import { reorderingCopy } from "@/lib/reordering-copy";
import ReorderingEditor from "../reordering-editor/reordering-editor";

export default function ReorderingWorkspace() {
  return (
    <ScenarioWorkspaceFrame screen="reordering" translations={reorderingCopy}>
      {(context) => (
        <ReorderingEditor key={context.snapshotId} {...context} />
      )}
    </ScenarioWorkspaceFrame>
  );
}
