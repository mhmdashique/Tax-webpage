"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ui";
import {
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Mail,
  LockKeyhole,
  UserRound,
  FolderOpen,
  Briefcase,
  Loader2,
  BellRing,
  PenLine,
  Sparkles,
  UserPlus,
} from "lucide-react";

const ROLES = [
  { v: "client", t: "Client", d: "Upload & sign", Icon: FolderOpen },
  { v: "employee", t: "Employee", d: "Tasks & filings", Icon: Briefcase },
] as const;

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accountType, setAccountType] = useState<"client" | "employee">("client");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (password !== confirmPw) {
      setErr("Passwords do not match. Please re-enter the same password in both fields.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role: accountType }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not create account");

      const sb = createClient();
      if (sb) {
        await sb.auth.signInWithPassword({ email, password }).then(() => {}, () => {});
      }
      window.location.href = "/pending-approval";
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Backdrop — same model as sign in */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-40 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(37,99,235,.20), transparent)" }}
        />
        <div
          className="absolute -left-32 bottom-0 h-96 w-96 rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(124,58,237,.14), transparent)" }}
        />
        <div
          className="absolute -right-32 top-1/3 h-96 w-96 rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(14,165,233,.14), transparent)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse 70% 55% at 50% 0%, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 55% at 50% 0%, black 30%, transparent 75%)",
            opacity: 0.25,
          }}
        />
      </div>

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg font-extrabold text-white"
            style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)", boxShadow: "0 8px 24px rgba(37,99,235,.4)" }}
          >
            T
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-extrabold tracking-tight">TaxDesk</span>
            <span className="block text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>FilePilot OS</span>
          </span>
        </Link>
        <div className="flex items-center gap-2.5">
          <Link href="/" className="hidden text-[13px] font-semibold hover:underline sm:block hover:text-[var(--accent)]">
            ← Back to home
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Body */}
      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 px-5 pb-12 lg:grid-cols-[1fr_460px]">
        {/* Left copy — desktop only */}
        <div className="hidden max-w-xl lg:block">
          <p
            className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-white"
              style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)" }}
            >
              <Sparkles size={12} /> New
            </span>
            <span style={{ color: "var(--text-2)" }}>Join 300+ modern firms</span>
          </p>
          <h1 className="mt-5 text-5xl font-extrabold leading-[1.03] tracking-tight">
            Create your account,{" "}
            <span
              style={{
                background: "linear-gradient(100deg,#2563EB,#7C3AED 60%,#0EA5E9)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              skip the tax-season chaos.
            </span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed" style={{ color: "var(--text-2)" }}>
            {accountType === "employee"
              ? "Get your focused task workspace — assigned clients, kanban filings and zero noise."
              : "Get your guided client portal — upload, e-sign and track in plain language."}
          </p>

          <div className="mt-7 grid max-w-md gap-3">
            <div className="flex items-center gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>
                <BellRing size={18} />
              </span>
              <div>
                <p className="text-sm font-bold">“VAT Q3 docs due Friday”</p>
                <p className="text-xs" style={{ color: "var(--text-2)" }}>Auto-reminder opened · client replied with 3 files</p>
              </div>
              <span className="ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--warn-bg)", color: "var(--warn-tx)" }}>Due in 3d</span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, #7C3AED 12%, transparent)", color: "#7C3AED" }}>
                <PenLine size={18} />
              </span>
              <div>
                <p className="text-sm font-bold">Corp Tax return · Bright Co</p>
                <p className="text-xs" style={{ color: "var(--text-2)" }}>Signed by both directors ✓</p>
              </div>
              <span className="ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}>Done</span>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-5 text-[13px] font-bold">
            {[["< 1hr", "to onboard"], ["No card", "free to start"], ["4.9/5", "client rating"]].map(([v, l]) => (
              <div key={l}>
                <p className="tnum text-xl font-extrabold">{v}</p>
                <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="mx-auto w-full max-w-[460px]">
          <div
            className="overflow-hidden rounded-[28px] border"
            style={{ borderColor: "var(--border)", background: "var(--surface)", boxShadow: "0 24px 80px rgba(15,23,42,.16)" }}
          >
            <div className="h-1.5" style={{ background: "linear-gradient(90deg,#2563EB,#7C3AED,#0EA5E9)" }} />
            <div className="p-7 md:p-8">
              <div className="flex items-center gap-3.5">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
                  style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-hover))", boxShadow: "0 8px 20px color-mix(in srgb, var(--accent) 35%, transparent)" }}
                >
                  <UserPlus size={22} />
                </span>
                <div>
                  <h2 className="text-[22px] font-extrabold leading-tight tracking-tight">Create your account</h2>
                  <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
                    {accountType === "employee" ? "Employee workspace — tasks, clients & deadlines" : "Client portal — uploads, e-sign & tracking"}
                  </p>
                </div>
              </div>

              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div>
                  <p className="mb-2 text-[13px] font-bold">I am joining as…</p>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
                    {ROLES.map(({ v, t, d, Icon }) => {
                      const active = accountType === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => { setAccountType(v); setErr(""); }}
                          className="rounded-2xl border px-2 py-3 text-center transition-all hover:-translate-y-0.5"
                          style={
                            active
                              ? { borderColor: "var(--accent)", background: "var(--accent-tint)", boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent)" }
                              : { borderColor: "var(--border)", background: "var(--bg)" }
                          }
                        >
                          <Icon size={18} className="mx-auto" style={{ color: active ? "var(--accent-hover)" : "var(--text-2)" }} />
                          <span className="mt-1.5 block text-[13px] font-extrabold" style={{ color: active ? "var(--accent-hover)" : "var(--text)" }}>{t}</span>
                          <span className="block text-[10.5px] font-medium leading-tight" style={{ color: "var(--text-2)" }}>{d}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-name" className="mb-1.5 block text-[13px] font-bold">Full name</label>
                  <div className="relative">
                    <UserRound size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-2)" }} />
                    <input
                      id="signup-name"
                      required
                      placeholder="Jane Cooper"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border py-3 pl-10 pr-3.5 text-sm outline-none transition-all focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15"
                      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-email" className="mb-1.5 block text-[13px] font-bold">Work email</label>
                  <div className="relative">
                    <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-2)" }} />
                    <input
                      id="signup-email"
                      required
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border py-3 pl-10 pr-3.5 text-sm outline-none transition-all focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15"
                      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-password" className="mb-1.5 block text-[13px] font-bold">Password</label>
                  <div className="relative">
                    <LockKeyhole size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-2)" }} />
                    <input
                      id="signup-password"
                      required
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Min. 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border py-3 pl-10 pr-11 text-sm outline-none transition-all focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15"
                      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors hover:bg-black/5"
                      style={{ color: "var(--text-2)" }}
                    >
                      {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  <div className="mt-2 flex gap-1.5" aria-hidden>
                    {[6, 10, 14].map((len) => (
                      <span key={len} className="h-1 flex-1 rounded-full transition-colors" style={{ background: password.length >= len ? "var(--accent)" : "var(--border)" }} />
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-confirm" className="mb-1.5 block text-[13px] font-bold">Confirm password</label>
                  <div className="relative">
                    <LockKeyhole size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-2)" }} />
                    <input
                      id="signup-confirm"
                      required
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      value={confirmPw}
                      onChange={(e) => { setConfirmPw(e.target.value); setErr(""); }}
                      className="w-full rounded-xl border py-3 pl-10 pr-11 text-sm outline-none transition-all focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15"
                      style={{
                        borderColor: confirmPw && confirmPw !== password ? "#DC2626" : "var(--border)",
                        background: "var(--bg)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 transition-colors hover:bg-black/5"
                      style={{ color: "var(--text-2)" }}
                    >
                      {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {confirmPw && confirmPw !== password && (
                    <p className="mt-1.5 text-xs font-semibold" style={{ color: "#DC2626" }}>Passwords do not match</p>
                  )}
                </div>

                {err && (
                  <p className="rounded-xl border px-3.5 py-3 text-[13px] font-medium leading-relaxed" style={{ background: "var(--danger-bg)", color: "var(--danger-tx)", borderColor: "color-mix(in srgb, var(--danger-tx) 25%, transparent)" }}>
                    {err}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-bold text-white transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                  style={{ background: "linear-gradient(120deg,var(--accent),var(--accent-hover))", boxShadow: "0 10px 28px color-mix(in srgb, var(--accent) 40%, transparent)" }}
                >
                  {loading ? (<><Loader2 size={17} className="animate-spin" /> Creating…</>) : (<>Create {accountType} account <ArrowRight size={16} /></>)}
                </button>

                <p className="text-center text-xs font-medium" style={{ color: "var(--text-2)" }}>
                  Admin approval required — usually within a day
                </p>

                <div className="flex items-center gap-3 py-1">
                  <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                  <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>Already have an account?</span>
                  <span className="h-px flex-1" style={{ background: "var(--border)" }} />
                </div>

                <Link
                  href="/login"
                  className="btn-ghost flex w-full items-center justify-center gap-2 !rounded-xl py-3 text-sm"
                  style={{ background: "var(--bg)" }}
                >
                  Log in <ArrowRight size={15} />
                </Link>
              </form>
            </div>
            <div className="flex items-center justify-center gap-1.5 border-t px-6 py-3.5 text-xs font-medium" style={{ borderColor: "var(--border)", color: "var(--text-2)", background: "var(--bg)" }}>
              <ShieldCheck size={13} className="text-emerald-600" /> Your data is encrypted & never shared
            </div>
          </div>

          <p className="mt-4 text-center text-xs sm:hidden" style={{ color: "var(--text-2)" }}>
            <Link href="/" className="font-semibold hover:underline">← Back to home</Link>
          </p>
        </div>
      </main>

      <footer className="relative z-10 pb-5 text-center text-xs" style={{ color: "var(--text-2)" }}>
        Free to start · No credit card · Cancel anytime
      </footer>
    </div>
  );
}
