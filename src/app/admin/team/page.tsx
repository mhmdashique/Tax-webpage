"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Card, EmptyState, Badge, Button, DataTable } from "@/components/ui";
import { ApprovalManager, ApprovalCountBadge, ApprovalActionButtons } from "@/components/approvals";
import { Users, Plus } from "lucide-react";

interface FirmUser {
  id: string;
  email: string;
  name: string;
  role: string;
  requested_role?: string | null;
  approval_status?: string;
  rejected_reason?: string | null;
  created_at?: string;
}

const inputCls = "w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none";
const inputStyle = { borderColor: "var(--border)", background: "var(--bg)" } as const;

function approvalBadge(u: FirmUser) {
  const s = u.approval_status ?? "approved";
  if (s === "pending") return <Badge tone="warning">Pending</Badge>;
  if (s === "rejected") return <Badge tone="danger">Rejected</Badge>;
  return <Badge tone="success">Approved</Badge>;
}

export default function TeamPage() {
  const { data, mutate, isLoading } = useSWR<{ data: FirmUser[] }>("/api/admin/users", async (url: string) => {
    const r = await fetch(url);
    const j = (await r.json().catch(() => ({}))) as { data?: FirmUser[]; error?: string };
    if (!r.ok) throw new Error(j.error ?? "Could not load team");
    return { data: j.data ?? [] };
  });
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "employee" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!msg && !err) return;
    const t = setTimeout(() => { setMsg(""); setErr(""); }, 5000);
    return () => clearTimeout(t);
  }, [msg, err]);

  function notify(message: string, ok: boolean) {
    if (ok) { setMsg(message); setErr(""); }
    else { setErr(message); setMsg(""); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setSaving(true);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = (await r.json().catch(() => ({}))) as { data?: FirmUser; warning?: string | null; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not create account");
      setMsg(`✓ ${j.data?.email} created as ${j.data?.role} — they can log in immediately.${j.warning ? ` Warning: ${j.warning}` : ""}`);
      setForm({ name: "", email: "", password: "", role: "employee" });
      mutate();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not create account");
    } finally {
      setSaving(false);
    }
  }

  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Approval queue sits above everything: new sign-ups land here first. */}
      <ApprovalManager />
      <div>
        <h1 className="text-2xl font-bold">Team & Performance</h1>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          Create employee and client logins directly — instant login, no email verification needed.
        </p>
      </div>
      {msg && <p className="rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}>{msg}</p>}
      {err && <p className="rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: "var(--danger-bg)", color: "var(--danger-tx)" }}>{err}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-semibold">New account</h2>
          <form onSubmit={create} className="space-y-3">
            <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls} style={inputStyle} />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls} style={inputStyle} />
            <input required type="password" minLength={6}
              placeholder="Temporary password (min 6 chars)"
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
            {err && <p className="text-sm" style={{ color: "#DC2626" }}>{err}</p>}
            <Button className="w-full" disabled={saving}><Plus size={15} /> {saving ? "Creating…" : "Create login"}</Button>
            <p className="text-xs" style={{ color: "var(--text-2)" }}>
              Client accounts also get a linked company record, so their documents and filings are visible on first login.
            </p>
          </form>
        </Card>
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">Firm logins <ApprovalCountBadge /></h2>
            <Button
              variant="ghost"
              onClick={async () => {
                setMsg(""); setErr("");
                try {
                  const r = await fetch("/api/admin/approvals/sync", { method: "POST" });
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error ?? "Sync failed");
                  notify(`Synced: ${j.synced} found, ${j.adopted} adopted, ${j.linked} company records repaired.`, true);
                  mutate();
                } catch (e: any) {
                  notify(e.message ?? "Sync failed", false);
                }
              }}
            >
              Sync signups
            </Button>
          </div>
          {isLoading ? <div className="skeleton h-40" /> : rows.length === 0 ? (
            <EmptyState icon={<Users size={22} />} title="No team members yet — create the first login on the left" />
          ) : (
            <DataTable columns={["Name", "Role", "Approval", "Email", "Actions"]} rows={rows.map((u) => ([
              <span key="n" className="font-semibold">{u.name}</span>,
              <span key="r"><Badge tone={u.role === "admin" ? "accent" : u.role === "employee" ? "success" : "neutral"}>{u.requested_role && u.approval_status === "pending" ? u.requested_role : u.role}</Badge></span>,
              <span key="a">{approvalBadge(u)}</span>,
              <span key="e" className="text-xs">{u.email}</span>,
              <span key="m">
                {u.role === "admin" ? (
                  <span className="text-xs" style={{ color: "var(--text-2)" }}>—</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    <ApprovalActionButtons
                      u={{
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        role: u.role,
                        requested_role: u.requested_role ?? null,
                        approval_status: u.approval_status ?? "approved",
                        rejected_reason: u.rejected_reason ?? null,
                        created_at: u.created_at ?? new Date().toISOString(),
                        reviewed_at: null,
                      }}
                      onChanged={() => mutate()}
                      notify={notify}
                      allowRevoke
                    />
                  </span>
                )}
              </span>,
            ]))} />
          )}
        </Card>
      </div>
    </div>
  );
}
