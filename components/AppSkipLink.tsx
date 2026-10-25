"use client";
import { useLang } from "./LanguageProvider";
import { merchandisingCopy } from "@/lib/merchandising-copy";
export default function AppSkipLink() {
  const { lang } = useLang();
  return (
    <a href="#main-content" className="skip-link">
      {merchandisingCopy[lang].skip}
    </a>
  );
}
