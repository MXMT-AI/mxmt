import { redirect } from "next/navigation";

// Root redirect — middleware handles auth check before this renders
export default function Home() {
  redirect("/dashboard");
}
