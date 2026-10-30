"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";

import { Link } from "@/i18n/navigation";
import { safeReturnPath } from "@/i18n/redirect";
import { ThemeToggle } from "@/components/ThemeProvider";
import { useLang, LangToggle } from "@/components/LanguageProvider";

export default function RegisterPage() {
  const router = useRouter();
  const { t, lang } = useLang();
  const returnTo = useSearchParams().get("next");
  const authQuery = returnTo ? `?${new URLSearchParams({ next: returnTo })}` : "";
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
      const destination = safeReturnPath(new URLSearchParams(window.location.search).get("next"), lang);
      const path = destination.slice(lang.length + 1);
      router.push(path.startsWith("/") ? path : `/${path}`);
      router.refresh();
    } catch {
      setError(t.auth_err_network);
    } finally {
      setLoading(false);
    }
  }

  const ic = "w-full bg-(--input-bg) border border-(--border) rounded-lg px-4 py-2.5 text-(--text) text-sm focus:outline-hidden focus:border-accent-cyan/40 transition-colors placeholder:text-(--subtle)";
  const lc = "block text-[10px] font-mono uppercase tracking-widest text-(--muted) mb-2";

  return (
    <div className="min-h-screen bg-(--bg) flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-accent-cyan/10 border border-accent-cyan/20 flex items-center justify-center">
              <span className="text-accent-cyan font-mono text-xs font-bold tracking-widest">MX</span>
            </div>
            <span className="text-(--text) font-semibold text-lg tracking-tight">MXMT Analytics</span>
          </div>
          <p className="text-(--muted) text-sm">{t.auth_subtitle_register}</p>
        </div>

        <div className="bg-(--surface) border border-(--border) rounded-2xl p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><label htmlFor="register-business-name" className={lc}>{t.auth_business_name}</label><input id="register-business-name" type="text" value={form.businessName} onChange={set("businessName")} required className={ic} placeholder="MXMT Store" /></div>
            <div><label htmlFor="register-name" className={lc}>{t.auth_your_name}</label><input id="register-name" type="text" value={form.name} onChange={set("name")} required autoComplete="name" className={ic} /></div>
            <div><label htmlFor="register-email" className={lc}>{t.auth_email}</label><input id="register-email" type="email" value={form.email} onChange={set("email")} required autoComplete="email" className={ic} placeholder="you@company.com" /></div>
            <div><label htmlFor="register-password" className={lc}>{t.auth_password}</label><input id="register-password" type="password" value={form.password} onChange={set("password")} required autoComplete="new-password" className={ic} placeholder="min 8" /></div>
            <div><label htmlFor="register-confirm-password" className={lc}>{t.auth_confirm_password}</label><input id="register-confirm-password" type="password" value={form.confirmPassword} onChange={set("confirmPassword")} required autoComplete="new-password" className={ic} placeholder="••••••••" /></div>
            {error && <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-red-400 text-sm">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-accent-cyan hover:bg-[#00c9ab] disabled:opacity-50 disabled:cursor-not-allowed text-[#0d1117] font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors mt-2">
              {loading ? t.auth_creating : t.auth_create_btn}
            </button>
          </form>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
          <p className="text-(--muted) text-sm">
            {t.auth_have_account}{" "}
            <Link href={`/login${authQuery}`} className="text-(--focus-ring) hover:underline">{t.auth_sign_in}</Link>
          </p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LangToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
