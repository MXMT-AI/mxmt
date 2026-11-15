"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { BrandMark } from "@/components/brand-mark/brand-mark";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { AuthField } from "../auth-field/auth-field";
import { AuthFormError } from "../auth-form-error/auth-form-error";
import { useAuthNavigation } from "../use-auth-navigation";

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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) { setError(t.auth_err_passwords); return; }
    if (form.password.length < 8) { setError(t.auth_err_short); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: form.businessName, name: form.name, email: form.email, password: form.password }),
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

        <div className="bg-(--surface) border border-(--border) rounded-2xl p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <AuthFormError message={error} />
            <Button variant="accent" type="submit" disabled={loading} className="mt-2 w-full">
              {loading ? t.auth_creating : t.auth_create_btn}
            </Button>
          </form>
        </div>

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
