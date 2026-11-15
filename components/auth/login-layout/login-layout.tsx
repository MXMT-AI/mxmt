import type { ReactNode } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { BrandLink } from "@/components/brand-link/brand-link";
import { Container } from "@/components/ui/container/container";
import { SkipLink } from "@/components/ui/skip-link/skip-link";
import { Link } from "@/i18n/navigation";
import { LoginBackdrop } from "../login-backdrop/login-backdrop";

const barClassName = "flex min-h-[65px] flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 max-[480px]:min-h-[58px]";
const navLinkClassName = "inline-flex min-h-10 items-center gap-[7px] text-sm hover:text-(--accent) max-[480px]:text-[.8125rem] [&_svg]:shrink-0 [&_svg]:text-(--accent)";
const loginMainId = "login-main";

export default async function LoginLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  return (
    <div className="flex min-h-svh flex-col bg-(--bg) text-(--text)">
      <SkipLink targetId={loginMainId} />
      <header className="border-b border-(--border) bg-(--surface)">
        <Container gutter="fixed" className={barClassName}>
          <BrandLink variant="auth" />
          <Link href="/docs" className={navLinkClassName}>
            {t("nav_documentation")}<ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </Container>
      </header>

      <main id={loginMainId} tabIndex={-1} className="relative isolate grid flex-1 place-items-center px-5 py-[clamp(32px,7vh,84px)]">
        <LoginBackdrop />
        {children}
      </main>

      <footer className="border-t border-(--border) bg-(--surface) text-[.8125rem] text-(--login-muted)">
        <Container gutter="fixed" className={barClassName}>
          <span>© MXMT Analytics</span>
          <Link href="/" className={navLinkClassName}>
            <ArrowLeft size={15} aria-hidden="true" />{t("nav_back_home")}
          </Link>
        </Container>
      </footer>
    </div>
  );
}
