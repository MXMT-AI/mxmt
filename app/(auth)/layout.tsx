import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// If already authenticated, skip the auth pages
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  if (cookieStore.has("access_token")) redirect("/dashboard");
  return <>{children}</>;
}
