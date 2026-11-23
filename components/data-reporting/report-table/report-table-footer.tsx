import type { ComponentProps, ReactNode } from "react";
import { Pager } from "@/components/ui/pager/pager";

type ReportTableFooterProps = ComponentProps<typeof Pager> & {
  rowCount: number;
  emptyState: ReactNode;
  emptyAfterPager?: boolean;
};

export function ReportTableFooter({
  rowCount,
  emptyState,
  emptyAfterPager = false,
  ...pagerProps
}: ReportTableFooterProps) {
  const empty = rowCount === 0 ? emptyState : null;
  return (
    <>
      {emptyAfterPager ? null : empty}
      <Pager {...pagerProps} />
      {emptyAfterPager ? empty : null}
    </>
  );
}
