"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { AuthField } from "../auth-field/auth-field";
import { AuthForm } from "../auth-form/auth-form";
import { useAuthNavigation } from "../use-auth-navigation/use-auth-navigation";
import { useAuthSubmit } from "../use-auth-submit/use-auth-submit";
import { authLoginFormMessages as englishCopy } from "@/messages/en.json";

export default function LoginForm() {
  const { t, lang } = useLang();
  const { authQuery, navigateAfterAuth } = useAuthNavigation(lang);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { error, loading, submit } = useAuthSubmit({
    endpoint: "/api/auth/login",
    fallbackError: t.auth_err_network,
    onSuccess: navigateAfterAuth,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit({ email, password });
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

      <AuthForm
        onSubmit={handleSubmit}
        error={error}
        loading={loading}
        submitLabel={t.auth_sign_in}
        pendingLabel={t.auth_signing_in}
        panelClassName="p-[clamp(20px,5vw,28px)] shadow-[0_18px_52px_color-mix(in_srgb,var(--text)_6%,transparent)]"
      >
        <AuthField
          id="login-email"
          label={t.auth_email}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          placeholder={englishCopy.placeholderYouCompanyCom}
        />
        <AuthField
          id="login-password"
          label={t.auth_password}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
          placeholder={englishCopy.placeholder}
        />
      </AuthForm>

      <Text variant="body" className="mt-5 text-center leading-5 text-[color:var(--login-muted)]">
        {t.auth_no_account}{" "}
        <Link href={`/register${authQuery}`} className="font-semibold text-(--focus-ring) hover:underline hover:underline-offset-[3px]">{t.auth_create_workspace}</Link>
      </Text>
    </section>
  );
}
