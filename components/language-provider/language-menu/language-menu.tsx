"use client";

import { Check, Globe } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { DisclosureMenu } from "@/components/ui/disclosure-menu/disclosure-menu";
import { useChangeLocale } from "../use-change-locale";

const languages = [
  { locale: "en", label: "English" },
  { locale: "uk", label: "Українська" },
] as const;

export function LanguageMenu({ label, title }: { label: string; title: string }) {
  const { locale, changeLocale } = useChangeLocale();

  return (
    <DisclosureMenu
      closeOnSelect
      className="relative max-[1190px]:static"
      summaryClassName="grid size-10 place-items-center rounded-full border border-transparent text-landing-muted hover:border-landing-line hover:bg-landing-hover-surface hover:text-landing-mint [[open]>&]:border-landing-line [[open]>&]:bg-landing-hover-surface [[open]>&]:text-landing-mint max-[640px]:w-9"
      panelClassName="top-[calc(100%_+_8px)] right-0 z-1 w-48 rounded-[14px] p-2 shadow-[0_12px_32px_#0003] max-[1190px]:right-6 max-[640px]:right-[18px]"
      label={<><Globe aria-hidden="true" size={17} /><span className="sr-only">{label}</span></>}
    >
      <p className="mb-1 border-b border-landing-line px-2 pt-[3px] pb-2 font-semibold">{title}</p>
      {languages.map((option) => (
        <Button
          key={option.locale}
          lang={option.locale}
          aria-pressed={locale === option.locale}
          onClick={() => changeLocale(option.locale)}
          className="flex min-h-10 w-full justify-between rounded-md border-0 px-2 py-0 font-sans text-sm text-landing-muted hover:bg-landing-hover-surface hover:text-landing-mint aria-pressed:bg-landing-hover-surface aria-pressed:font-semibold aria-pressed:text-landing-mint"
        >
          {option.label}
          {locale === option.locale && <Check size={16} aria-hidden="true" />}
        </Button>
      ))}
    </DisclosureMenu>
  );
}
