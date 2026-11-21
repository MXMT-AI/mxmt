"use client";

import { useState } from "react";
import type { Lang } from "@/lib/translations";
import { Button } from "@/components/ui/button/button";
import { Dialog } from "@/components/ui/dialog/dialog";

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
  const title = uk ? "Перенести правки до нового зрізу?" : "Transfer edits to the new snapshot?";
  const keep = uk ? "Залишити попередній зріз" : "Keep previous snapshot";
  const transfer = uk ? "Перенести правки" : "Transfer edits";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm" role="status">
          {uk ? "Чернетка відкрита на попередньому зрізі." : "The draft is open on the previous snapshot."}
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
                ? "Після перенесення система перевірить ці правки за даними нового зрізу."
                : "After transfer, the system checks these edits against the new snapshot."}
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
