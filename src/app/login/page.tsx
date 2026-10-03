"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"client" | "employee" | "admin">("client");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  function friendlyError(e: unknown) {
    // supabase-js AuthErrors carry a machine-readable `code` — map it first
    // so each message names the real bucket and the real wait.
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    const msg = e instanceof Error ? e.message : "Login failed";
    if (/email not confirmed/i.test(msg)) {
      return "Your login isn't activated yet — ask your admin to approve (or re-approve) your request from the Team page, then try again.";
    }
    if (code === "over_request_rate_limit" || /rate.?limit|too many requests|429|after \d+ seconds/i.test(msg)) {
      return "Too many attempts from this network. Close this page, wait about 5 minutes without retrying (every retry restarts the wait), then try once.";
    }
    return msg;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const sb = createClient();
      if (!sb) throw new Error("Supabase is not configured.");
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Read approval status + role from the server (service-role, no-cache).
      // This bypasses browser-client caching and RLS so we always get the
      // actual current value from the database.
      const meRes = await fetch("/api/auth/me", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
      });
      if (!meRes.ok) {
        const j = (await meRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Could not read your account status");
      }
      const me = (await meRes.json()) as {
        role?: string | null;
        approval_status?: string | null;
      };

      if (me.approval_status === "pending") {
        window.location.replace("/pending-approval");
        return;
      }
      if (me.approval_status === "rejected") {
        window.location.replace("/access-denied");
        return;
      }

      const role = me.role;
      if (!role || !["admin", "employee", "client"].includes(role)) {
        throw new Error("Your account has no role assigned. Contact your administrator.");
      }

      window.location.replace(`/${role}/dashboard`);
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
          <Button className="w-full" disabled={loading}>{loading ? "Signing in…" : "Log in"}</Button>
          <p className="text-center text-sm" style={{ color: "var(--text-2)" }}>New client? <Link href="/signup" className="font-semibold text-[#2563EB] hover:underline">Create account</Link></p>
        </form>
      </div>
    </div>
  );
}
