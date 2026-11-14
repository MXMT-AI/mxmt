import { getLocale } from "next-intl/server";
import { ProblemScreen } from "@/components/problem-screen/problem-screen";

export default async function NotFound() {
  return <ProblemScreen code="404" locale={await getLocale()} />;
}
