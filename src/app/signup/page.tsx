"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { demoSignup } from "@/lib/demo-auth";
import { Button, Card } from "@/components/ui";

export default function SignupPage() {
  const [name, setName] = useState("Demo Admin");
  const [email, setEmail] = useState("admin@taxdesk.io");
  const [password, setPassword] = useState("Admin123!");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const sb = createClient();
      if (!sb) {
        demoSignup(name, email);
        router.push("/admin/dashboard");
        return;
      }
      const { error } = await sb.auth.signUp({ email, password, options: { data: { name, role: "admin" } } });
      if (error) throw error;
      router.push("/admin/dashboard");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md space-y-4">
        <form onSubmit={onSubmit} className="card w-full space-y-4 p-8">
          <p className="text-xl font-bold">Start free with TaxDesk</p>
          <input required placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <input required type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <input required type="password" placeholder="Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          {err && <p className="text-sm" style={{ color: "#DC2626" }}>{err}</p>}
          <Button className="w-full" disabled={loading}>{loading ? "Creating…" : "Create firm account"}</Button>
          <p className="text-center text-sm" style={{ color: "var(--text-2)" }}>Have an account? <Link href="/login" className="font-semibold text-[#2563EB] hover:underline">Log in</Link></p>
        </form>
        <Card>
          <p className="text-xs" style={{ color: "var(--text-2)" }}>Dummy login for testing: <span className="font-mono font-semibold" style={{ color: "var(--text)" }}>admin@taxdesk.io / Admin123!</span> · employee@taxdesk.io / Employee123! · client@taxdesk.io / Client123!</p>
        </Card>
      </div>
    </div>
  );
}
