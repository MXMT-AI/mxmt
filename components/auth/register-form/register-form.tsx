"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { BrandMark } from "@/components/brand-mark/brand-mark";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { AuthField } from "../auth-field/auth-field";
import { AuthForm } from "../auth-form/auth-form";
import { useAuthNavigation } from "../use-auth-navigation/use-auth-navigation";
import { useAuthSubmit } from "../use-auth-submit/use-auth-submit";

const fields = [
  { field: "businessName", id: "register-business-name", label: "auth_business_name", type: "text", placeholder: "MXMT Store" },
  { field: "name", id: "register-name", label: "auth_your_name", type: "text", autoComplete: "name" },
  { field: "email", id: "register-email", label: "auth_email", type: "email", autoComplete: "email", placeholder: "you@company.com" },
  { field: "password", id: "register-password", label: "auth_password", type: "password", autoComplete: "new-password", placeholder: "min 8" },
  { field: "confirmPassword", id: "register-confirm-password", label: "auth_confirm_password", type: "password", autoComplete: "new-password", placeholder: "••••••••" },
] as const;

export default function RegisterForm() {
  const { t, lang } = useLang();
  const { authQuery, navigateAfterAuth } = useAuthNavigation(lang);
  const [form, setForm] = useState({ businessName: "", name: "", email: "", password: "", confirmPassword: "" });
  const { error, loading, setError, submit } = useAuthSubmit({
    endpoint: "/api/auth/register",
    fallbackError: t.auth_err_network,
    onSuccess: navigateAfterAuth,
  });

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) { setError(t.auth_err_passwords); return; }
    if (form.password.length < 8) { setError(t.auth_err_short); return; }
    await submit({ businessName: form.businessName, name: form.name, email: form.email, password: form.password });
  }

  return (
    <div className="min-h-screen bg-(--bg) flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <BrandMark size={36} />
            <span className="text-(--text) font-semibold text-lg tracking-tight">MXMT Analytics</span>
          </div>
          <Heading as="h1" variant="compact" className="font-normal text-(--muted)">
            {t.auth_subtitle_register}
          </Heading>
        </div>

        <AuthForm
          onSubmit={handleSubmit}
          error={error}
          loading={loading}
          submitLabel={t.auth_create_btn}
          pendingLabel={t.auth_creating}
        >
          {fields.map(({ field, label, ...input }) => (
            <AuthField
              {...input}
              key={field}
              variant="register"
              label={t[label]}
              value={form[field]}
              onChange={set(field)}
              required
            />
          ))}
        </AuthForm>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
          <Text variant="body" className="leading-5">
            {t.auth_have_account}{" "}
            <Link href={`/login${authQuery}`} className="text-(--focus-ring) hover:underline">{t.auth_sign_in}</Link>
          </Text>
        </div>
      </div>
    </div>
  );
}
