"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";

const RESEND_COOLDOWN = 60;

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"client" | "employee">("client");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

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
          redirectTo: `${window.location.origin}/login`,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        emailed?: boolean;
        alreadyConfirmed?: boolean;
        error?: string;
      };
      if (!r.ok) throw new Error(j.error ?? "Could not send confirmation link");
      if (j.alreadyConfirmed) throw new Error("Already confirmed — just log in.");
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
    setLoading(true);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          role: accountType,
          redirectTo: `${window.location.origin}/login`,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        needsConfirmation?: boolean;
        error?: string;
      };
      if (!r.ok) throw new Error(j.error ?? "Could not create account");
      if (j.needsConfirmation) {
        setDone(true);
      } else {
        window.location.href = `/${accountType}/dashboard`;
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "var(--bg)" }}>
        <div className="w-full max-w-md">
          <div className="card w-full space-y-4 p-8 text-center">
            <p className="text-2xl">📧</p>
            <p className="text-xl font-bold">Check your email</p>
            <p className="text-sm" style={{ color: "var(--text-2)" }}>
              We sent a confirmation link to <strong>{email}</strong> via Resend. Click it to activate your account then log in.
            </p>
            <div className="rounded-[10px] border p-4 text-left text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <p className="font-semibold">Didn&apos;t get the mail?</p>
              <ul className="mt-1 list-disc space-y-1 pl-5" style={{ color: "var(--text-2)" }}>
                <li>Check your spam / promotions folder.</li>
                <li>Make sure <strong>{email}</strong> is correct.</li>
              </ul>
              <button
                type="button"
                onClick={resendConfirmation}
                disabled={resending || cooldown > 0}
                className="btn-ghost mt-3 w-full rounded-[10px] py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {resending ? "Resending…" : cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend confirmation link"}
              </button>
              {resent && (
                <p className="mt-2 text-sm font-medium text-green-600">
                  Confirmation link sent — check your inbox.
                </p>
              )}
              {err && <p className="mt-2 text-sm" style={{ color: "#DC2626" }}>{err}</p>}
            </div>
            <Link href="/login" className="btn-primary block w-full rounded-[10px] py-2.5 text-center text-sm font-semibold text-white" style={{ background: "#2563EB" }}>
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md">
        <form onSubmit={onSubmit} className="card w-full space-y-4 p-8">
          <p className="text-xl font-bold">Create your account</p>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            {accountType === "employee" ? "Employee workspace access" : "Client portal access"}
          </p>
          <div>
            <p className="mb-1.5 text-sm font-medium">I am a…</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
              {([{ v: "client", t: "Client" }, { v: "employee", t: "Employee" }] as const).map((o) => {
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
          <input required placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <input required type="password" placeholder="Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          {err && <p className="text-sm" style={{ color: "#DC2626" }}>{err}</p>}
          <Button className="w-full" disabled={loading}>{loading ? "Creating…" : "Create account"}</Button>
          <p className="text-center text-sm" style={{ color: "var(--text-2)" }}>Already have an account? <Link href="/login" className="font-semibold text-[#2563EB] hover:underline">Log in</Link></p>
        </form>
      </div>
    </div>
  );
}
