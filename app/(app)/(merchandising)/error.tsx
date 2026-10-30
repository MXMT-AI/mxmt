"use client";
import { useLang } from "@/components/LanguageProvider";
import { merchandisingCopy } from "@/lib/merchandising-copy";
export default function MerchandisingError({ reset }: { reset: () => void }) {
  const { lang } = useLang(),
    copy = merchandisingCopy[lang];
  return (
    <div role="alert" className="p-4 md:p-8 space-y-3">
      <p>{copy.error}</p>
      <button
        type="button"
        className="min-h-11 rounded-lg border border-(--border) px-4 py-2 hover:bg-(--input-bg)"
        onClick={reset}
      >
        {copy.retry}
      </button>
    </div>
  );
}
