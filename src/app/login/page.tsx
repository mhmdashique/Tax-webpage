"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEMO_USERS, demoLogin, type DemoRole } from "@/lib/demo-auth";
import { Button, Card } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@taxdesk.io");
  const [password, setPassword] = useState("Admin123!");
  const [role, setRole] = useState<DemoRole>("admin");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function fill(u: (typeof DEMO_USERS)[number]) {
    setEmail(u.email);
    setPassword(u.password);
    setRole(u.role);
    setErr("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const sb = createClient();
      if (!sb) {
        // Demo mode (no Supabase): validate against dummy accounts
        const u = demoLogin(email, password);
        if (!u) throw new Error("Invalid dummy credentials — use one of the demo accounts below.");
        router.push(`/${u.role}/dashboard`);
        return;
      }
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push(`/${role}/dashboard`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md space-y-4">
        <form onSubmit={onSubmit} className="card w-full space-y-4 p-8">
          <p className="text-xl font-bold">Welcome back to TaxDesk</p>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>Log in to your {role} portal.</p>
          <div className="flex gap-2">
            {(["admin", "employee", "client"] as const).map((r) => (
              <button key={r} type="button" onClick={() => {
                setRole(r);
                const preset = DEMO_USERS.find((d) => d.role === r);
                if (preset) { setEmail(preset.email); setPassword(preset.password); }
              }}
                className={`flex-1 rounded-[10px] border px-3 py-2 text-sm font-semibold capitalize ${role === r ? "text-white" : ""}`}
                style={role === r ? { background: "#2563EB", borderColor: "#2563EB" } : { borderColor: "var(--border)" }}>{r}</button>
            ))}
          </div>
          <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <input required type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          {err && <p className="text-sm" style={{ color: "#DC2626" }}>{err}</p>}
          <Button className="w-full" disabled={loading}>{loading ? "Signing in…" : "Log in"}</Button>
          <p className="text-center text-sm" style={{ color: "var(--text-2)" }}>No account? <Link href="/signup" className="font-semibold text-[#2563EB] hover:underline">Sign up</Link></p>
        </form>

        <Card>
          <p className="eyebrow mb-2">Dummy accounts — click to autofill</p>
          <div className="space-y-2">
            {DEMO_USERS.map((u) => (
              <button key={u.email} type="button" onClick={() => fill(u)}
                className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-all hover:-translate-y-px hover:shadow-md"
                style={{ borderColor: "var(--border)" }}>
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "#2563EB" }}>{u.role[0].toUpperCase()}</span>
                <span><span className="block font-semibold capitalize">{u.role} · {u.name}</span>
                  <span className="tnum block font-mono text-xs" style={{ color: "var(--text-2)" }}>{u.email} / {u.password}</span></span>
                <span className="ml-auto text-xs font-bold text-[#2563EB]">Use →</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>Demo mode: no Supabase required. With Supabase env vars set, real Auth is used instead.</p>
        </Card>
      </div>
    </div>
  );
}
