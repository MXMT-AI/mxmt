"use client";

import { useState } from "react";
import type { Lang } from "@/lib/translations";
import { Button } from "@/components/ui/button/button";
import { Dialog } from "@/components/ui/dialog/dialog";
import { merchandisingScenarioDraftTransferMessages as englishCopy } from "@/messages/en.json";
import { merchandisingScenarioDraftTransferMessages as ukrainianCopy } from "@/messages/uk.json";

type ScenarioVersion = { snapshotId: string; asOf?: string };

export function useScenarioDraftVersion(current: ScenarioVersion, hasEdits: boolean) {
  const [previous, setPrevious] = useState(current);
  const pending = hasEdits && previous.snapshotId !== current.snapshotId;
  if (!pending && previous.snapshotId !== current.snapshotId) setPrevious(current);
  return {
    version: pending ? previous : current,
    pending,
    transfer: () => setPrevious(current),
  };
}

export function ScenarioDraftTransfer({ lang, onTransfer }: {
  lang: Lang;
  onTransfer: () => void;
}) {
  const [open, setOpen] = useState(true);
  const uk = lang === "uk";
  const title = uk ? ukrainianCopy.titleTransferEditsToTheNew : englishCopy.titleTransferEditsToTheNew;
  const keep = uk ? ukrainianCopy.keep : englishCopy.keep;
  const transfer = uk ? ukrainianCopy.transfer : englishCopy.transfer;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm" role="status">
          {uk ? ukrainianCopy.theDraftIsOpenOn : englishCopy.theDraftIsOpenOn}
        </p>
        <Button variant="report" onClick={() => setOpen(true)}>{transfer}</Button>
      </div>
      {open ? (
        <Dialog
          title={title}
          closeLabel={keep}
          onClose={() => setOpen(false)}
          className="overscroll-contain backdrop:overflow-hidden backdrop:overscroll-contain"
        >
          <div className="space-y-4 p-6">
            <p>
              {uk
                ? ukrainianCopy.afterTransferTheSystemChecks
                : englishCopy.afterTransferTheSystemChecks}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="report" onClick={() => setOpen(false)}>{keep}</Button>
              <Button variant="report" onClick={onTransfer}>{transfer}</Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
