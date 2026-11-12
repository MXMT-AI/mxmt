"use client";

import { useLocale } from "next-intl";
import { ProblemScreen } from "@/components/ProblemScreen";

export default function PageError({ retry }: { retry: () => void }) {
  return <ProblemScreen code="500" locale={useLocale()} retry={retry} />;
}
