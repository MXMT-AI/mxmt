import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getLocale } from "next-intl/server";
import { BrandMark } from "@/components/brand-mark/brand-mark";
import { landingCopy } from "@/components/landing/copy";
import { Link } from "@/i18n/navigation";
import { LoginBackdrop } from "../login-backdrop/login-backdrop";

const barClassName = "mx-auto flex min-h-[65px] w-[min(100%_-_40px,1320px)] flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 max-[480px]:min-h-[58px]";
const homeLabel = { uk: "На головну", en: "Back to home" };

export default async function LoginLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const copy = landingCopy[locale];

  return (
    <div className="flex min-h-svh flex-col bg-(--bg) text-(--text)">
      <a className="skip-link" href="#login-main">{copy.skip}</a>
      <header className="border-b border-(--border) bg-(--surface)">
        <div className={barClassName}>
          <Link href="/" className="inline-flex items-center gap-[7px] text-[1.1875rem] font-bold tracking-[-.045em] max-[480px]:gap-1 max-[480px]:text-base">
            <BrandMark transparent />
            MXMT <span className="font-[450] text-(--login-muted)">Analytics</span>
          </Link>
          <Link href="/docs" className="inline-flex min-h-10 items-center gap-[7px] text-sm hover:text-(--accent) max-[480px]:text-[.8125rem] [&_svg]:shrink-0 [&_svg]:text-(--accent)">
            {copy.documentation}<ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main id="login-main" className="relative isolate grid flex-1 place-items-center px-5 py-[clamp(32px,7vh,84px)]">
        <LoginBackdrop />
        {children}
      </main>

      <footer className="border-t border-(--border) bg-(--surface) text-[.8125rem] text-(--login-muted)">
        <div className={barClassName}>
          <span>© MXMT Analytics</span>
          <Link href="/" className="inline-flex min-h-10 items-center gap-[7px] text-sm hover:text-(--accent) max-[480px]:text-[.8125rem] [&_svg]:shrink-0 [&_svg]:text-(--accent)">
            <ArrowLeft size={15} aria-hidden="true" />{homeLabel[locale]}
          </Link>
        </div>
      </footer>
    </div>
  );
}
