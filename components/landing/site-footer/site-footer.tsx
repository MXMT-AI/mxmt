import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { BrandLink } from "@/components/brand-link/brand-link";
import { Container } from "@/components/ui/container/container";

export function SiteFooter({ loginLabel }: { loginLabel: string }) {
  return (
    <footer>
      <Container className="flex min-h-[92px] flex-wrap items-center justify-between gap-5 py-4">
        <BrandLink variant="landing" />
        <Link href="/login" className="flex items-center gap-2 text-sm text-landing-muted hover:text-landing-mint">{loginLabel}<ArrowRight size={15} aria-hidden="true" /></Link>
      </Container>
    </footer>
  );
}
