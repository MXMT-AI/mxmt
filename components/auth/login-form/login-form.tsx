"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { AuthField } from "../auth-field/auth-field";
import { AuthFormError } from "../auth-form-error/auth-form-error";
import { useAuthNavigation } from "../use-auth-navigation";

export default function LoginForm() {
  const { t, lang } = useLang();
  const { authQuery, navigateAfterAuth } = useAuthNavigation(lang);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t.auth_err_network); return; }
      navigateAfterAuth();
    } catch {
      setError(t.auth_err_network);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full max-w-[400px]" aria-labelledby="login-title">
      <Heading
        as="h1"
        variant="page"
        id="login-title"
        className="mb-[22px] text-center text-[length:clamp(1.65rem,5vw,2.125rem)] leading-[1.12] font-[650] tracking-[-.045em] text-balance"
      >
        {t.auth_subtitle_login}
      </Heading>

      <div className="rounded-2xl border border-(--border) bg-(--surface) p-[clamp(20px,5vw,28px)] shadow-[0_18px_52px_color-mix(in_srgb,var(--text)_6%,transparent)]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField
            id="login-email"
            label={t.auth_email}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
          <AuthField
            id="login-password"
            label={t.auth_password}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
          <AuthFormError message={error} />
          <Button variant="accent" type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? t.auth_signing_in : t.auth_sign_in}
          </Button>
        </form>
      </div>

      <Text variant="body" className="mt-5 text-center leading-5 text-[color:var(--login-muted)]">
        {t.auth_no_account}{" "}
        <Link href={`/register${authQuery}`} className="font-semibold text-(--focus-ring) hover:underline hover:underline-offset-[3px]">{t.auth_create_workspace}</Link>
      </Text>
    </section>
  );
}
