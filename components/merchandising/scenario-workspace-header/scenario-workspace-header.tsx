import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";

export function ScenarioWorkspaceHeader({ backHref, copy, busy, onRefresh }: {
  backHref: string;
  copy: { back: string; title: string; intro: string; refresh: string };
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="flex flex-wrap justify-between items-start gap-4">
      <div>
        <Link
          className="text-sm text-(--muted) underline underline-offset-4"
          href={backHref}
        >
          {copy.back}
        </Link>
        <Heading as="h1" variant="page" className="mt-3 text-2xl tracking-normal text-inherit">
          {copy.title}
        </Heading>
        <Text variant="body" className="mt-2 leading-normal text-(--muted)">{copy.intro}</Text>
      </div>
      <Button variant="report" onClick={onRefresh} disabled={busy}>
        {copy.refresh}
      </Button>
    </header>
  );
}
