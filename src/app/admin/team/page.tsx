"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Card, EmptyState, Badge, Button, DataTable } from "@/components/ui";
import { Users, Plus } from "lucide-react";

interface FirmUser { id: string; email: string; name: string; role: string; email_confirmed: boolean | null; }
interface NotifyResult { emailed: boolean; emailNote: string | null; loginLink: string | null; }
interface ResendStatus { connected: boolean; from: string | null; error?: string; }

const inputCls = "w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none";
const inputStyle = { borderColor: "var(--border)", background: "var(--bg)" } as const;

const RESEND_COOLDOWN = 60;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

function LoginLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="mt-1 flex items-center gap-2">
      <input readOnly value={link} onFocus={(e) => e.target.select()}
        className="min-w-0 flex-1 rounded-lg border px-2 py-1 font-mono text-[11px]" style={inputStyle} />
      <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-xs font-bold"
        onClick={async () => { setCopied(await copyText(link)); setTimeout(() => setCopied(false), 2000); }}>
        {copied ? "Copied ✓" : "Copy link"}
      </button>
    </span>
  );
}

export default function TeamPage() {
  const { data, mutate, isLoading } = useSWR<{ data: FirmUser[] }>("/api/admin/users", async (url: string) => {
    const r = await fetch(url);
    const j = (await r.json().catch(() => ({}))) as { data?: FirmUser[]; error?: string };
    if (!r.ok) throw new Error(j.error ?? "Could not load team");
    return { data: j.data ?? [] };
  });
  const { data: resendStatus } = useSWR<ResendStatus>("/api/admin/users/resend", (url: string) =>
    fetch(url).then((r) => r.json())
  );
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "employee", sendEmail: true });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [created, setCreated] = useState<NotifyResult | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [resendOut, setResendOut] = useState<Record<string, NotifyResult>>({});

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 5000);
    return () => clearTimeout(t);
  }, [msg]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setCreated(null);
    setSaving(true);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, redirectTo: `${window.location.origin}/login` }),
      });
      const j = (await r.json().catch(() => ({}))) as { data?: FirmUser; emailed?: boolean; emailNote?: string | null; loginLink?: string | null; warning?: string | null; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not create account");
      setMsg(`✓ ${j.data?.email} created as ${j.data?.role} — they can log in immediately.${j.emailed ? " Welcome email sent." : ""}${j.warning ? ` Warning: ${j.warning}` : ""}`);
      setCreated({ emailed: Boolean(j.emailed), emailNote: j.emailNote ?? null, loginLink: j.loginLink ?? null });
      setForm({ name: "", email: "", password: "", role: "employee", sendEmail: true });
      mutate();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not create account");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (Object.keys(cooldowns).length === 0) return;
    const t = setInterval(() => {
      setCooldowns((p) => {
        const n: Record<string, number> = {};
        for (const [k, v] of Object.entries(p)) if (v > 1) n[k] = v - 1;
        return n;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [cooldowns]);

  async function resend(email: string) {
    if (resending || (cooldowns[email] ?? 0) > 0) return;
    setResending(email);
    try {
      const r = await fetch("/api/admin/users/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo: `${window.location.origin}/login` }),
      });
      const j = (await r.json().catch(() => ({}))) as NotifyResult & { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Resend failed");
      setResendOut((p) => ({ ...p, [email]: { emailed: j.emailed, emailNote: j.emailNote, loginLink: j.loginLink } }));
      setCooldowns((p) => ({ ...p, [email]: RESEND_COOLDOWN }));
    } catch (e: unknown) {
      setResendOut((p) => ({ ...p, [email]: { emailed: false, emailNote: e instanceof Error ? e.message : "Resend failed", loginLink: null } }));
    } finally {
      setResending(null);
    }
  }

  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Team & Performance</h1>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          Create employee and client logins directly — pre-confirmed, so no confirmation email is sent and no rate limits apply.
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span style={{ color: "var(--text-2)" }}>Email delivery (Resend):</span>
          {!resendStatus ? (
            <span style={{ color: "var(--text-2)" }}>Checking…</span>
          ) : resendStatus.connected ? (
            <>
              <Badge tone="success">✓ Connected</Badge>
              {resendStatus.from && <span style={{ color: "var(--text-2)" }}>· from {resendStatus.from}</span>}
            </>
          ) : (
            <>
              <Badge tone="warning">✗ Not configured</Badge>
              <span style={{ color: "var(--text-2)" }}>{resendStatus.error} — set RESEND_API_KEY in .env.local</span>
            </>
          )}
        </div>
      </div>
      {msg && <p className="rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}>{msg}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-semibold">New account</h2>
          <form onSubmit={create} className="space-y-3">
            <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls} style={inputStyle} />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls} style={inputStyle} />
            <input required={!form.sendEmail} type="password"
              placeholder={form.sendEmail ? "Temporary password (optional — they set their own via email link)" : "Temporary password (min 6 chars)"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} style={inputStyle} />
            <div>
              <p className="mb-1.5 text-sm font-medium">Account type *</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
                {([
                  { v: "employee", t: "Employee", d: "Firm staff — sees assigned clients" },
                  { v: "client", t: "Client", d: "Customer — own docs & filings only" },
                ] as const).map((o) => {
                  const active = form.role === o.v;
                  return (
                    <button key={o.v} type="button" role="radio" aria-checked={active}
                      onClick={() => setForm({ ...form, role: o.v })}
                      className="rounded-[10px] border px-3 py-2.5 text-left"
                      style={active
                        ? { borderColor: "#2563EB", background: "var(--accent-tint)" }
                        : { borderColor: "var(--border)", background: "var(--bg)" }}>
                      <span className="block text-sm font-semibold">{o.t}{active ? " ✓" : ""}</span>
                      <span className="block text-[11px]" style={{ color: "var(--text-2)" }}>{o.d}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-start gap-2 text-xs" style={{ color: "var(--text-2)" }}>
              <input type="checkbox" checked={form.sendEmail} onChange={(e) => setForm({ ...form, sendEmail: e.target.checked })} className="mt-0.5" />
              <span>Send welcome email via Resend — account is created unconfirmed and the invite link is emailed. If Resend is not configured the account is still created with instant login.</span>
            </label>
            {err && <p className="text-sm" style={{ color: "#DC2626" }}>{err}</p>}
            <Button className="w-full" disabled={saving}><Plus size={15} /> {saving ? "Creating…" : "Create login"}</Button>
            {created && (
              <div className="rounded-[10px] border p-3 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                <p className="font-semibold">{created.emailed ? "📧 Welcome email sent." : "📧 No email sent."}</p>
                {created.emailNote && <p className="mt-1" style={{ color: "var(--text-2)" }}>{created.emailNote}</p>}
                {created.loginLink && (
                  <span className="mt-1 block" style={{ color: "var(--text-2)" }}>
                    Shareable login link (expires in ~1h) — forward it manually if mail didn&apos;t arrive:
                    <LoginLinkBox link={created.loginLink} />
                  </span>
                )}
              </div>
            )}
            <p className="text-xs" style={{ color: "var(--text-2)" }}>
              Client accounts also get a linked company record, so their documents and filings are visible on first login.
            </p>
          </form>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Firm logins</h2>
          {isLoading ? <div className="skeleton h-40" /> : rows.length === 0 ? (
            <EmptyState icon={<Users size={22} />} title="No team members yet — create the first login on the left" />
          ) : (
            <DataTable columns={["Name", "Role", "Confirmed", "Email", "Notify"]} rows={rows.map((u) => {
              const cd = cooldowns[u.email] ?? 0;
              const out = resendOut[u.email];
              return [
              <span key="n" className="font-semibold">{u.name}</span>,
              <span key="r"><Badge tone={u.role === "admin" ? "accent" : u.role === "employee" ? "success" : "neutral"}>{u.role}</Badge></span>,
              <span key="c">{u.email_confirmed === null ? <span className="text-xs" style={{ color: "var(--text-2)" }}>—</span>
                : u.email_confirmed ? <Badge tone="success">Yes</Badge> : <Badge tone="warning">Pending mail</Badge>}</span>,
              <span key="e" className="text-xs">{u.email}</span>,
              <span key="m">
                <button type="button" disabled={resending !== null || cd > 0}
                  onClick={() => resend(u.email)} className="btn-ghost px-2 py-1 text-xs font-bold disabled:opacity-50"
                  title="Resend invite (unconfirmed) or send a login/reset email (confirmed)">
                  {resending === u.email ? "Sending…" : cd > 0 ? `Retry in ${cd}s` : "Resend email"}
                </button>
                {out && (
                  <span className="mt-1 block max-w-[260px] text-[11px]" style={{ color: out.emailed ? "#16A34A" : "var(--text-2)" }}>
                    {out.emailed ? "✓ Email sent." : out.emailNote}
                    {out.loginLink && <LoginLinkBox link={out.loginLink} />}
                  </span>
                )}
              </span>,
              ];
            })} />
          )}
        </Card>
      </div>
    </div>
  );
}
