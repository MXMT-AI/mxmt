"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLang, LangToggle } from "@/components/LanguageProvider";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLang();
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
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(t.auth_err_network);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-xl bg-[#00e5c4]/10 border border-[#00e5c4]/20 flex items-center justify-center">
              <span className="text-[#00e5c4] font-mono text-xs font-bold tracking-widest">MX</span>
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">MXMT Analytics</span>
          </div>
          <p className="text-[var(--muted)] text-sm">{t.auth_subtitle_login}</p>
        </div>

        <div className="bg-[#161b22] border border-[var(--border)] rounded-2xl p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2">{t.auth_email}</label>
              <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                className="w-full bg-[#0d1117] border border-[var(--border)] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#00e5c4]/40 transition-colors placeholder:text-[#3d444d]"
                placeholder="you@company.com" />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2">{t.auth_password}</label>
              <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
                className="w-full bg-[#0d1117] border border-[var(--border)] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#00e5c4]/40 transition-colors placeholder:text-[#3d444d]"
                placeholder="••••••••" />
            </div>
            {error && <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-red-400 text-sm">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full bg-[#00e5c4] hover:bg-[#00c9ab] disabled:opacity-50 disabled:cursor-not-allowed text-[#0d1117] font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors mt-2">
              {loading ? t.auth_signing_in : t.auth_sign_in}
            </button>
          </form>
        </div>

        <div className="flex items-center justify-between mt-5">
          <p className="text-[var(--muted)] text-sm">
            {t.auth_no_account}{" "}
            <Link href="/register" className="text-[#00e5c4] hover:underline">{t.auth_create_workspace}</Link>
          </p>
          <LangToggle />
        </div>
      </div>
    </div>
  );
}
