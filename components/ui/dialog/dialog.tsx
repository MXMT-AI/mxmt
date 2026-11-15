"use client";

import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../button/button";
import { Heading } from "../heading/heading";

export function Dialog({
  title,
  subtitle,
  closeLabel,
  closeDisabled = false,
  onClose,
  className,
  children,
}: {
  title: ReactNode;
  subtitle?: string;
  closeLabel: string;
  closeDisabled?: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    // Close while the element is still mounted so the browser restores focus.
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={cn(
        "fixed inset-0 m-auto max-h-[85vh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-(--border) bg-(--surface) p-0 text-(--text) shadow-[0_24px_64px_rgba(0,0,0,.5)] backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
      onClick={(event) => {
        if (!closeDisabled && event.target === event.currentTarget) onClose();
      }}
    >
      <div>
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-(--border) bg-(--surface) px-6 py-4">
          <div className="min-w-0">
            {subtitle && <p className="mb-0.5 font-mono text-[9px] tracking-widest text-(--subtle) uppercase">{subtitle}</p>}
            <Heading as="h2" variant="dialog" id={titleId}>{title}</Heading>
          </div>
          <Button
            variant="icon"
            className="size-8 min-h-0 min-w-0 shrink-0"
            aria-label={closeLabel}
            autoFocus
            disabled={closeDisabled}
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
