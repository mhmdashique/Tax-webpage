"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

const RESEND_COOLDOWN = 60;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"client" | "employee" | "admin">("client");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function friendlyError(e: unknown) {
    // supabase-js AuthErrors carry a machine-readable `code` — map it first
    // so each message names the real bucket and the real wait.
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    const msg = e instanceof Error ? e.message : "Login failed";
    if (code === "over_email_send_rate_limit" || /over_email_send_rate_limit/i.test(msg)) {
      return "The built-in mail quota is used up (2 emails/hour). Tap “Resend confirmation link” below and we’ll send it via our backup mailer instead — or ask your admin to confirm your account from the Team page.";
    }
    if (code === "over_request_rate_limit" || /rate.?limit|too many requests|429|after \d+ seconds/i.test(msg)) {
      return "Too many attempts from this network. Close this page, wait about 5 minutes without retrying (every retry restarts the wait), then try once.";
    }
    return msg;
  }

  async function resendConfirmation() {
    if (cooldown > 0 || !email) return;
    setErr("");
    setResent(false);
    setResending(true);
    try {
      const r = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          redirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        emailed?: boolean;
        alreadyConfirmed?: boolean;
        error?: string;
      };
      if (!r.ok) throw new Error(j.error ?? "Could not send confirmation link");
      if (j.alreadyConfirmed) throw new Error("This email is already confirmed — just log in.");
      setResent(true);
      setCooldown(RESEND_COOLDOWN);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not resend");
    } finally {
      setResending(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setResent(false);
    setNeedsConfirmation(false);
    setLoading(true);
    try {
      const sb = createClient();
      if (!sb) throw new Error("Supabase is not configured.");
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        // Show mail-confirmation section instead of a raw error when email is unconfirmed
        if (/email not confirmed|confirmation|confirm.*email/i.test(error.message)) {
          setNeedsConfirmation(true);
          throw new Error("Please confirm your email first — we can resend the confirmation link below.");
        }
        throw error;
      }

      // Try DB first, fall back to JWT metadata
      let role: string | null = null;
      const { data: profile } = await sb.from("users").select("role").eq("id", data.user.id).single();
      role = (profile as { role: string } | null)?.role ?? null;

      // Fallback: read from auth user_metadata (set during signup / seed)
      if (!role) {
        role = (data.user.user_metadata?.role as string) ?? null;
      }

      if (!role || !["admin", "employee", "client"].includes(role)) {
        throw new Error("Your account has no role assigned. Contact your administrator.");
      }

      // The tab above must match the account's actual role — otherwise the
      // user lands on the wrong dashboard.
      if (role !== accountType) {
        await sb.auth.signOut().then(() => {}, () => {});
        const label = role === "admin" ? "Admin" : role === "employee" ? "Employee" : "Client";
        throw new Error(`This login belongs to a ${label} account. Select "${label}" above and try again.`);
      }

      window.location.href = `/${role}/dashboard`;
    } catch (e: unknown) {
      setErr(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md">
        <form onSubmit={onSubmit} className="card w-full space-y-4 p-8">
          <p className="text-xl font-bold">Welcome back to TaxDesk</p>
          <div>
            <p className="mb-1.5 text-sm font-medium">I am a…</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Account type">
              {([
                { v: "client", t: "Client" },
                { v: "employee", t: "Employee" },
                { v: "admin", t: "Admin" },
              ] as const).map((o) => {
                const active = accountType === o.v;
                return (
                  <button key={o.v} type="button" role="radio" aria-checked={active}
                    onClick={() => { setAccountType(o.v); setErr(""); }}
                    className="rounded-[10px] border px-2 py-2 text-sm font-semibold"
                    style={active
                      ? { borderColor: "#2563EB", background: "var(--accent-tint)", color: "var(--accent-hover)" }
                      : { borderColor: "var(--border)", background: "var(--bg)", color: "var(--text-2)" }}>
                    {o.t}
                  </button>
                );
              })}
            </div>
          </div>
          <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <input required type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          {err && <p className="text-sm" style={{ color: "#DC2626" }}>{err}</p>}
          {needsConfirmation && (
            <div className="rounded-[10px] border p-4 text-left text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <p className="font-semibold">📧 Confirm your email</p>
              <p className="mt-1" style={{ color: "var(--text-2)" }}>
                We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then try logging in again.
              </p>
              <button
                type="button"
                onClick={resendConfirmation}
                disabled={resending || !email || cooldown > 0}
                className="btn-ghost mt-3 w-full rounded-[10px] py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {resending ? "Resending…" : cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend confirmation link"}
              </button>
              {resent && (
                <p className="mt-2 text-sm font-medium text-green-600">
                  Confirmation link sent via Resend — check your inbox (and spam folder).
                </p>
              )}
            </div>
          )}
          <Button className="w-full" disabled={loading}>{loading ? "Signing in…" : "Log in"}</Button>
          <p className="text-center text-sm" style={{ color: "var(--text-2)" }}>New client? <Link href="/signup" className="font-semibold text-[#2563EB] hover:underline">Create account</Link></p>
        </form>
      </div>
    </div>
  );
}
