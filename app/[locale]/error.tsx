"use client";

import { useLocale } from "next-intl";
import { ProblemScreen } from "@/components/problem-screen/problem-screen";

export default function PageError({ retry }: { retry: () => void }) {
  return <ProblemScreen code="500" locale={useLocale()} retry={retry} />;
}
