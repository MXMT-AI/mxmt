"use client";
import { useLang } from "@/components/LanguageProvider";
import { merchandisingCopy } from "@/lib/merchandising-copy";
export default function MerchandisingLoading() {
  const { lang } = useLang();
  return (
    <p role="status" className="p-4 md:p-8 text-sm text-(--muted)">
      {merchandisingCopy[lang].loading}
    </p>
  );
}
