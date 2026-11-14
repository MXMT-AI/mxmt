"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { safeReturnPath } from "@/i18n/redirect";
import { useLang } from "@/components/language-provider/language-provider";

export default function LoginForm() {
  const router = useRouter();
  const { t, lang } = useLang();
  const returnTo = useSearchParams().get("next");
  const authQuery = returnTo ? `?${new URLSearchParams({ next: returnTo })}` : "";
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

  return (
    <section className="w-full max-w-[400px]" aria-labelledby="login-title">
      <h1 id="login-title" className="mb-[22px] text-center text-[clamp(1.65rem,5vw,2.125rem)] leading-[1.12] font-[650] tracking-[-.045em] text-balance">{t.auth_subtitle_login}</h1>

      <div className="rounded-2xl border border-(--border) bg-(--surface) p-[clamp(20px,5vw,28px)] shadow-[0_18px_52px_color-mix(in_srgb,var(--text)_6%,transparent)]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-[.8125rem] font-[550] text-(--login-muted)">{t.auth_email}</label>
            <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
              className="w-full bg-(--input-bg) border border-(--border) rounded-lg px-4 py-2.5 text-(--text) text-base sm:text-sm focus:border-(--focus-ring) placeholder:text-(--login-muted)"
              placeholder="you@company.com" />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-[.8125rem] font-[550] text-(--login-muted)">{t.auth_password}</label>
            <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
              className="w-full bg-(--input-bg) border border-(--border) rounded-lg px-4 py-2.5 text-(--text) text-base sm:text-sm focus:border-(--focus-ring) placeholder:text-(--login-muted)"
              placeholder="••••••••" />
          </div>
          {error && <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-(--error-text) text-sm">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full bg-accent-fill hover:bg-[#00c9ab] disabled:opacity-50 disabled:cursor-not-allowed text-[#0d1117] font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors mt-2">
            {loading ? t.auth_signing_in : t.auth_sign_in}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-(--login-muted)">
        {t.auth_no_account}{" "}
        <Link href={`/register${authQuery}`} className="font-semibold text-(--focus-ring) hover:underline hover:underline-offset-[3px]">{t.auth_create_workspace}</Link>
      </p>
    </section>
  );
}
