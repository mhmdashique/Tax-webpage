"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"client" | "employee">("client");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role: accountType }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not create account");

      // No email verification — sign in immediately. New accounts are pending,
      // so the approval gate routes them to the waiting screen.
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
          <p className="text-center text-sm" style={{ color: "var(--text-2)" }}>
            Your account will need admin approval before you can log in.
          </p>
          <p className="text-center text-sm" style={{ color: "var(--text-2)" }}>Already have an account? <Link href="/login" className="font-semibold text-[#2563EB] hover:underline">Log in</Link></p>
        </form>
      </div>
    </div>
  );
}
