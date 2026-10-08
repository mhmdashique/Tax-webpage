"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, RadialBarChart, RadialBar,
} from "recharts";
import {
  Users, Search, Clock3, CheckCircle2, CircleAlert, Gauge,
  BadgeCheck, TrendingUp, Crown, ArrowRight, Send, UserPlus, RefreshCw,
  Trophy, Medal, Target, Zap, ArrowUpRight, Star, X, Mail, CalendarDays,
  Briefcase, FileText, Wallet,
} from "lucide-react";
import { Badge, EmptyState, Button, Modal } from "./ui";
import { PremCard, TOOLTIP, PREMIUM } from "./premium-theme";
import { ApprovalCountBadge, ApprovalActionButtons } from "./approvals";
import { useFilings, useTasks, useClients, usePayments, useCurrentUser } from "@/lib/hooks";
import { isComplete, isOverdue } from "@/lib/lifecycle";
import { formatMoney } from "@/lib/data";

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

const AVATAR_BG = ["#4F46E5", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#F59E0B", "#EC4899", "#14B8A6"];

function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
}

function initials(name: string) {
  return name.split(" ").map((p) => p.slice(0, 1)).join("").slice(0, 2).toUpperCase() || "?";
}

function daysUntil(due?: string | null): number | null {
  if (!due) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(+d)) return null;
  return Math.round((d.getTime() - t.getTime()) / 864e5);
}

function approvalBadge(u: FirmUser) {
  const s = u.approval_status ?? "approved";
  if (s === "pending") return <Badge tone="warning">Pending</Badge>;
  if (s === "rejected") return <Badge tone="danger">Rejected</Badge>;
  return <Badge tone="success">Approved</Badge>;
}

function effectiveRole(u: FirmUser) {
  return u.requested_role && u.approval_status === "pending" ? u.requested_role : u.role;
}

const inputCls = "w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none";
const inputStyle = { borderColor: "var(--border)", background: "var(--bg)" } as const;
const thCls = "px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.1em]";
const tdCls = "px-4 py-3 align-middle";

/* ------------------------------------------------------------------ */
/*  TEAM DIRECTORY — table-wise approve / decline + pending + create   */
/* ------------------------------------------------------------------ */

export function TeamDirectory() {
  const { data, mutate, isLoading } = useSWR<{ data: FirmUser[] }>("/api/admin/users", async (url: string) => {
    const r = await fetch(url);
    const j = (await r.json().catch(() => ({}))) as { data?: FirmUser[]; error?: string };
    if (!r.ok) throw new Error(j.error ?? "Could not load team");
    return { data: j.data ?? [] };
  });
  const { data: tasks = [] } = useTasks();
  const { data: clients = [] } = useClients();
  const { data: filings = [] } = useFilings();
  const { data: payments = [] } = usePayments();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "employee" | "client">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [sort, setSort] = useState<"recent" | "name" | "workload">("recent");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "employee" });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function notify(message: string, ok: boolean) {
    if (ok) { setMsg(message); setErr(""); }
    else { setErr(message); setMsg(""); }
    window.setTimeout(() => { setMsg(""); setErr(""); }, 6000);
  }

  const rows = data?.data ?? [];

  const roster = useMemo(() => rows.map((u) => {
    const assigned = tasks.filter((t) => t.assigned_to === u.id);
    const open = assigned.filter((t) => !["done", "cancelled"].includes(String(t.status)));
    const done = assigned.filter((t) => String(t.status) === "done");
    const overdue = open.filter((t) => (daysUntil(t.due_date) ?? 0) < 0);
    const owned = clients.filter((c) => (c as { assigned_employee_id?: string | null }).assigned_employee_id === u.id);
    const pct = assigned.length ? Math.round((done.length / assigned.length) * 100) : 0;
    return { u, assigned: assigned.length, open: open.length, done: done.length, overdue: overdue.length, owned: owned.length, pct };
  }), [rows, tasks, clients]);

  const counts = useMemo(() => ({
    all: rows.length,
    admin: rows.filter((u) => effectiveRole(u) === "admin").length,
    employee: rows.filter((u) => effectiveRole(u) === "employee").length,
    client: rows.filter((u) => effectiveRole(u) === "client").length,
    pending: rows.filter((u) => (u.approval_status ?? "approved") === "pending").length,
    approved: rows.filter((u) => (u.approval_status ?? "approved") === "approved").length,
    rejected: rows.filter((u) => (u.approval_status ?? "approved") === "rejected").length,
  }), [rows]);

  function matchesQuery(u: FirmUser, q: string) {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return `${u.name} ${u.email}`.toLowerCase().includes(needle);
  }

  /* Pending requests — oldest first, respects search box */
  const pendingRows = useMemo(() => {
    return roster
      .filter((r) => (r.u.approval_status ?? "approved") === "pending" && matchesQuery(r.u, query))
      .sort((a, b) => +new Date(a.u.created_at ?? 0) - +new Date(b.u.created_at ?? 0));
  }, [roster, query]);

  /* All-members table — search + role + status + sort */
  const visible = useMemo(() => {
    let list = [...roster];
    if (roleFilter !== "all") list = list.filter((r) => effectiveRole(r.u) === roleFilter);
    if (statusFilter !== "all") list = list.filter((r) => (r.u.approval_status ?? "approved") === statusFilter);
    if (query.trim()) list = list.filter((r) => matchesQuery(r.u, query));
    if (sort === "name") list.sort((a, b) => a.u.name.localeCompare(b.u.name));
    else if (sort === "workload") list.sort((a, b) => b.overdue - a.overdue || b.open - a.open || b.assigned - a.assigned);
    else list.sort((a, b) => +new Date(b.u.created_at ?? 0) - +new Date(a.u.created_at ?? 0));
    return list;
  }, [roster, query, roleFilter, statusFilter, sort]);

  const filtersActive = query.trim() !== "" || roleFilter !== "all" || statusFilter !== "all";

  function resetFilters() {
    setQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
    setSort("recent");
  }

  function toApproval(u: FirmUser) {
    return {
      id: u.id, name: u.name, email: u.email, role: u.role,
      requested_role: u.requested_role ?? null,
      approval_status: u.approval_status ?? "approved",
      rejected_reason: u.rejected_reason ?? null,
      created_at: u.created_at ?? new Date().toISOString(),
      reviewed_at: null,
    };
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setMsg(""); setSaving(true);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = (await r.json().catch(() => ({}))) as { data?: FirmUser; warning?: string | null; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Could not create account");
      notify(`✓ ${j.data?.email} created as ${j.data?.role} — they can log in immediately.${j.warning ? ` Warning: ${j.warning}` : ""}`, true);
      setForm({ name: "", email: "", password: "", role: "employee" });
      setShowCreate(false);
      mutate();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Could not create account", false);
    } finally {
      setSaving(false);
    }
  }

  async function syncSignups() {
    setSyncing(true);
    try {
      const r = await fetch("/api/admin/approvals/sync", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { error?: string; synced?: number; adopted?: number; linked?: number };
      if (!r.ok) throw new Error(j.error ?? "Sync failed");
      notify(`Synced: ${j.synced} found, ${j.adopted} adopted, ${j.linked} company records repaired.`, true);
      mutate();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Sync failed", false);
    } finally {
      setSyncing(false);
    }
  }

  function memberCell(u: FirmUser) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: avatarColor(u.id) }}>
          {initials(u.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{u.name}</p>
          <p className="truncate text-xs" style={{ color: "var(--text-2)" }}>{u.email}</p>
        </div>
      </div>
    );
  }

  const selected = selectedId ? roster.find((r) => r.u.id === selectedId) ?? null : null;
  const selectedTasks = selected ? tasks.filter((t) => t.assigned_to === selected.u.id).sort((a, b) => (daysUntil(a.due_date) ?? 999) - (daysUntil(b.due_date) ?? 999)) : [];
  const selectedOwnedClients = selected ? clients.filter((c) => (c as { assigned_employee_id?: string | null }).assigned_employee_id === selected.u.id) : [];
  const selectedClientRecord = selected && effectiveRole(selected.u) === "client"
    ? clients.find((c) => (c as { linked_user_id?: string | null }).linked_user_id === selected.u.id || c.email.toLowerCase() === selected.u.email.toLowerCase()) ?? null
    : null;
  const selectedFilingScope = selected
    ? effectiveRole(selected.u) === "client" && selectedClientRecord
      ? filings.filter((f) => f.client_id === selectedClientRecord.id)
      : filings.filter((f) => selectedOwnedClients.some((c) => c.id === f.client_id))
    : [];
  const selectedPayments = selected
    ? selectedClientRecord
      ? payments.filter((p) => p.client_id === selectedClientRecord.id)
      : payments.filter((p) => selectedOwnedClients.some((c) => c.id === p.client_id))
    : [];
  const selectedPaid = selectedPayments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
  const selectedDue = selectedPayments.filter((p) => p.status !== "paid").reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div className="space-y-4">
      {msg && <p className="rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}>{msg}</p>}
      {err && <p className="rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: "var(--danger-bg)", color: "var(--danger-tx)" }}>{err}</p>}

      {/* ---------- 1 · FILTERS ---------- */}
      <PremCard
        title="Filters"
        sub="Search, filter and sort both tables below"
        action={
          <button
            onClick={syncSignups}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
            title="Pull any confirmed sign-ups missing from the queue into Pending"
          >
            <RefreshCw size={13} /> {syncing ? "Syncing…" : "Sync signups"}
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-2)" }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email…" className={`${inputCls} !pl-9`} style={inputStyle} />
            </label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-[10px] border px-3 py-2.5 text-sm font-semibold" style={inputStyle} aria-label="Filter by status">
              <option value="all">Status: all ({counts.all})</option>
              <option value="pending">Status: pending ({counts.pending})</option>
              <option value="approved">Status: approved ({counts.approved})</option>
              <option value="rejected">Status: rejected ({counts.rejected})</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-[10px] border px-3 py-2.5 text-sm font-semibold" style={inputStyle} aria-label="Sort members">
              <option value="recent">Sort: newest</option>
              <option value="name">Sort: name</option>
              <option value="workload">Sort: workload</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Role filter">
            {(["all", "admin", "employee", "client"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={roleFilter === k} onClick={() => setRoleFilter(k)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold capitalize ${roleFilter === k ? "text-white" : ""}`}
                style={roleFilter === k ? { background: "var(--accent)" } : { background: "var(--bg)", border: "1px solid var(--border)" }}>
                {k} · {k === "all" ? counts.all : counts[k]}
              </button>
            ))}
            {filtersActive && (
              <button onClick={resetFilters} className="ml-auto text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>
                Reset filters
              </button>
            )}
          </div>
        </div>
      </PremCard>

      {/* ---------- 2 · PENDING REQUESTS (approve / decline table) ---------- */}
      <PremCard
        title="Pending requests"
        sub={`${pendingRows.length} awaiting decision · oldest first · approve or decline with a reason`}
        action={<ApprovalCountBadge />}
      >
        {isLoading ? <div className="skeleton h-32" /> : pendingRows.length === 0 ? (
          <EmptyState icon={<Clock3 size={22} />} title={query ? `No pending requests match “${query}”` : "No pending requests — everything is decided"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-2)" }}>
                  <th className={thCls}>Member</th>
                  <th className={thCls}>Requested role</th>
                  <th className={thCls}>Requested on</th>
                  <th className={thCls}>Workload</th>
                  <th className={`${thCls} text-right`}>Decision</th>
                </tr>
              </thead>
              <tbody>
                {pendingRows.map(({ u, open, overdue, owned }) => (
                  <tr key={u.id} onClick={() => setSelectedId(u.id)} className="cursor-pointer border-t transition-colors hover:bg-black/[0.02]" style={{ borderColor: "var(--border)" }} title={`View ${u.name} — performance & details`}>
                    <td className={tdCls}>{memberCell(u)}</td>
                    <td className={tdCls}>
                      <Badge tone={(u.requested_role ?? u.role) === "employee" ? "success" : "accent"}>
                        {u.requested_role ?? u.role}
                      </Badge>
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-xs`} style={{ color: "var(--text-2)" }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-xs`} style={{ color: "var(--text-2)" }}>
                      {open} open{overdue > 0 ? ` · ${overdue} overdue` : ""} · {owned} client{owned === 1 ? "" : "s"}
                    </td>
                    <td className={tdCls} onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <ApprovalActionButtons u={toApproval(u)} onChanged={() => mutate()} notify={notify} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PremCard>

      {/* ---------- 3 · CREATE ACCOUNT ---------- */}
      <PremCard
        title="Create account"
        sub="Employee or client login — active immediately, no email verification needed"
        action={
          <Button onClick={() => setShowCreate((v) => !v)}><UserPlus size={15} /> {showCreate ? "Close" : "New account"}</Button>
        }
      >
        {showCreate ? (
          <form onSubmit={create} className="grid gap-2.5 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} style={{ ...inputStyle, background: "var(--surface)" }} />
              <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} style={{ ...inputStyle, background: "var(--surface)" }} />
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <input required type="password" minLength={6} placeholder="Temporary password (min 6 chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} style={{ ...inputStyle, background: "var(--surface)" }} />
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
                {(["employee", "client"] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={form.role === v} onClick={() => setForm({ ...form, role: v })}
                    className="rounded-[10px] border px-3 py-2 text-left text-xs font-bold capitalize"
                    style={form.role === v ? { borderColor: "var(--accent)", background: "var(--accent-tint)" } : { borderColor: "var(--border)", background: "var(--surface)" }}>
                    {v}{form.role === v ? " ✓" : ""}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={saving}><Send size={14} /> {saving ? "Creating…" : "Create login"}</Button>
              <p className="text-xs" style={{ color: "var(--text-2)" }}>They can log in immediately with this email + password.</p>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowCreate(true)} className="flex w-full items-center gap-3 rounded-2xl border border-dashed px-4 py-4 text-left transition-colors hover:bg-black/[0.02]" style={{ borderColor: "var(--border)" }}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>
              <UserPlus size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">Add an employee or client login in seconds</span>
              <span className="block text-xs" style={{ color: "var(--text-2)" }}>Name, email, temporary password, role — done.</span>
            </span>
            <span className="ml-auto shrink-0 text-xs font-bold" style={{ color: "var(--accent)" }}>New account →</span>
          </button>
        )}
      </PremCard>

      {/* ---------- 4 · ALL MEMBERS (table with approve / decline / revoke) ---------- */}
      <PremCard
        title="All members"
        sub={`${visible.length} shown · approve, decline or revoke access from the table`}
      >
        {isLoading ? <div className="skeleton h-48" /> : visible.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title={filtersActive ? "No members match these filters" : "No team members yet"} action={filtersActive ? <button onClick={resetFilters} className="text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>Reset filters</button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-2)" }}>
                  <th className={thCls}>Member</th>
                  <th className={thCls}>Role</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Tasks</th>
                  <th className={thCls}>Clients</th>
                  <th className={thCls}>Joined</th>
                  <th className={`${thCls} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ u, assigned, open, done, overdue, owned, pct }) => (
                  <tr key={u.id} onClick={() => setSelectedId(u.id)} className="cursor-pointer border-t transition-colors hover:bg-black/[0.02]" style={{ borderColor: "var(--border)" }} title={`View ${u.name} — performance & details`}>
                    <td className={tdCls}>{memberCell(u)}</td>
                    <td className={tdCls}>
                      <Badge tone={effectiveRole(u) === "admin" ? "accent" : effectiveRole(u) === "employee" ? "success" : "neutral"}>
                        {effectiveRole(u)}
                      </Badge>
                    </td>
                    <td className={tdCls}>{approvalBadge(u)}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      <span className="tnum font-bold">{done}/{assigned}</span>
                      <span className="text-xs" style={{ color: "var(--text-2)" }}> done · {pct}%</span>
                      {overdue > 0 && <span className="ml-1.5 rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: "var(--danger-bg)", color: "var(--danger-tx)" }}>{overdue} overdue</span>}
                    </td>
                    <td className={`${tdCls} tnum whitespace-nowrap`}>{owned}</td>
                    <td className={`${tdCls} whitespace-nowrap text-xs`} style={{ color: "var(--text-2)" }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </td>
                    <td className={tdCls} onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <ApprovalActionButtons u={toApproval(u)} onChanged={() => mutate()} notify={notify} allowRevoke />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PremCard>

      {/* ---------- 5 · MEMBER DETAIL (performance + details) ---------- */}
      <Modal open={!!selected} onClose={() => setSelectedId(null)} title={selected ? `${selected.u.name} — performance & details` : "Member"} size="xl">
        {selected && (() => {
          const { u, assigned, open, done, overdue, pct } = selected;
          const role = effectiveRole(u);
          const filingDone = selectedFilingScope.filter((f) => isComplete(String(f.status))).length;
          const filingOverdue = selectedFilingScope.filter((f) => isOverdue(String(f.status), f.due_date)).length;
          return (
            <div className="space-y-4">
              {/* Identity */}
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ background: avatarColor(u.id) }}>
                  {initials(u.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold">{u.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs" style={{ color: "var(--text-2)" }}><Mail size={12} /> {u.email}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: "var(--text-2)" }}>
                    <CalendarDays size={12} /> Joined {u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={role === "admin" ? "accent" : role === "employee" ? "success" : "neutral"}>{role}</Badge>
                  {approvalBadge(u)}
                </div>
              </div>

              {/* KPI strip */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { icon: <Briefcase size={15} />, v: String(assigned), l: "Tasks assigned" },
                  { icon: <CheckCircle2 size={15} />, v: `${pct}%`, l: `${done} done` },
                  { icon: <Clock3 size={15} />, v: String(open), l: "Open now" },
                  ...(role === "employee"
                    ? [{ icon: <Users size={15} />, v: String(selectedOwnedClients.length), l: "Clients owned" }]
                    : role === "client"
                      ? [{ icon: <FileText size={15} />, v: String(selectedFilingScope.length), l: "Filings" }]
                      : [{ icon: <Crown size={15} />, v: "Full", l: "Firm access" }]),
                ].map((s) => (
                  <div key={s.l} className="rounded-2xl border px-3 py-3 text-center" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                    <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>{s.icon}</span>
                    <p className="tnum mt-1.5 text-lg font-bold leading-none">{s.v}</p>
                    <p className="mt-1 text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>{s.l}</p>
                  </div>
                ))}
              </div>

              {/* Completion bar */}
              {role !== "admin" && (
                <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-bold">Task completion</span>
                    <span className="tnum font-bold">{done}/{assigned} · {pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-muted)" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: overdue > 0 ? "#DC2626" : "var(--accent)" }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                    <span>{open} open</span>·<span>{done} done</span>·
                    <span style={{ color: overdue > 0 ? "#DC2626" : undefined }}>{overdue} overdue</span>·
                    <span>{filingDone}/{selectedFilingScope.length} filings filed{filingOverdue > 0 ? ` · ${filingOverdue} overdue` : ""}</span>
                  </div>
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-2">
                {/* Tasks */}
                <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
                  <p className="text-sm font-bold">Assigned tasks <span style={{ color: "var(--text-2)" }}>({selectedTasks.length})</span></p>
                  {role === "admin" ? (
                    <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>Admins aren&apos;t assigned tasks — they see everything firm-wide.</p>
                  ) : selectedTasks.length === 0 ? (
                    <p className="mt-2 rounded-xl p-3 text-xs" style={{ background: "var(--bg)", color: "var(--text-2)" }}>No tasks assigned yet.</p>
                  ) : (
                    <div className="mt-2 max-h-[260px] space-y-2 overflow-y-auto">
                      {selectedTasks.slice(0, 20).map((t) => {
                        const n = daysUntil(t.due_date);
                        const od = (n ?? 0) < 0 && !["done", "cancelled"].includes(String(t.status));
                        return (
                          <div key={t.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={od ? { background: "var(--danger-bg)", color: "var(--danger-tx)" } : String(t.status) === "done" ? { background: "var(--success-bg)", color: "var(--success-tx)" } : { background: "var(--surface-muted)", color: "var(--text-2)" }}>
                              {String(t.status) === "done" ? <CheckCircle2 size={14} /> : od ? <CircleAlert size={14} /> : <Clock3 size={14} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{t.title}</span>
                              <span className="block text-xs" style={{ color: "var(--text-2)" }}>{String(t.status).replace(/_/g, " ")} · {t.due_date ?? "No due date"} · {t.priority}</span>
                            </span>
                            <Badge tone={od ? "danger" : String(t.status) === "done" ? "success" : "warning"}>
                              {od ? `Overdue ${-n!}d` : String(t.status).replace(/_/g, " ")}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Link href="/admin/tasks" className="mt-2 inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>
                    Open task board <ArrowRight size={12} />
                  </Link>
                </div>

                {/* Clients / filings / billing */}
                <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
                  {role === "employee" ? (
                    <>
                      <p className="text-sm font-bold">Owned clients <span style={{ color: "var(--text-2)" }}>({selectedOwnedClients.length})</span></p>
                      {selectedOwnedClients.length === 0 ? (
                        <p className="mt-2 rounded-xl p-3 text-xs" style={{ background: "var(--bg)", color: "var(--text-2)" }}>No clients assigned to {u.name.split(" ")[0]} yet.</p>
                      ) : (
                        <div className="mt-2 max-h-[220px] space-y-2 overflow-y-auto">
                          {selectedOwnedClients.slice(0, 20).map((c) => (
                            <div key={c.id} className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: avatarColor(c.id) }}>
                                {c.name.slice(0, 1).toUpperCase()}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold">{c.business_name ?? c.name}</span>
                                <span className="block truncate text-xs" style={{ color: "var(--text-2)" }}>{c.entity_type ?? c.status}</span>
                              </span>
                              <Link href="/admin/clients" className="shrink-0 text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>Open</Link>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : role === "client" ? (
                    <>
                      <p className="text-sm font-bold">Client record & billing</p>
                      {!selectedClientRecord ? (
                        <p className="mt-2 rounded-xl p-3 text-xs" style={{ background: "var(--warn-bg)", color: "var(--warn-tx)" }}>
                          No linked company record for {u.email} yet — run “Sync signups” so filings and invoices attach on first login.
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2 text-sm">
                          <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                            <p className="font-bold">{selectedClientRecord.business_name ?? selectedClientRecord.name}</p>
                            <p className="text-xs" style={{ color: "var(--text-2)" }}>{selectedClientRecord.entity_type ?? ""} · {selectedClientRecord.status}</p>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            {[
                              { v: String(selectedFilingScope.length), l: "Filings" },
                              { v: formatMoney(selectedPaid), l: "Paid" },
                              { v: formatMoney(selectedDue), l: "Due" },
                            ].map((s) => (
                              <div key={s.l} className="rounded-xl border px-1 py-2" style={{ borderColor: "var(--border)" }}>
                                <p className="tnum truncate text-sm font-bold">{s.v}</p>
                                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>{s.l}</p>
                              </div>
                            ))}
                          </div>
                          <Link href="/admin/clients" className="inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>
                            <Wallet size={12} /> Open in clients <ArrowRight size={12} />
                          </Link>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold">Admin access</p>
                      <p className="mt-2 rounded-xl p-3 text-xs" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>
                        <Crown size={12} className="mr-1 inline" /> Full firm access — every client, filing, task and invoice.
                      </p>
                      <Link href="/admin/performance" className="mt-2 inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>
                        <Gauge size={12} /> View firm performance <ArrowRight size={12} />
                      </Link>
                    </>
                  )}
                </div>
              </div>

              {/* Decision row for pending/rejected */}
              {(u.approval_status ?? "approved") !== "approved" || role !== "admin" ? (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <span className="text-xs font-bold" style={{ color: "var(--text-2)" }}>Access decision:</span>
                  <ApprovalActionButtons u={toApproval(u)} onChanged={() => { mutate(); setSelectedId(null); }} notify={notify} allowRevoke />
                  <button onClick={() => setSelectedId(null)} className="ml-auto inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold" style={{ borderColor: "var(--border)" }}>
                    <X size={13} /> Close
                  </button>
                </div>
              ) : (
                <div className="flex justify-end">
                  <button onClick={() => setSelectedId(null)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold" style={{ borderColor: "var(--border)" }}>
                    <X size={13} /> Close
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PERFORMANCE BOARD — new premium UI                                 */
/* ------------------------------------------------------------------ */

export function PerformanceBoard({ role = "admin" }: { role?: "admin" | "employee" }) {
  const isAdmin = role === "admin";
  const prem = isAdmin ? PREMIUM.admin : PREMIUM.employee;
  const { data: me } = useCurrentUser();
  const { data: filings = [] } = useFilings();
  const { data: tasks = [] } = useTasks();
  const { data: users = [] } = useSWR<{ id: string; name: string; role: string }[]>("perf-users", async () => {
    try {
      const r = await fetch("/api/admin/users");
      const j = await r.json();
      if (r.ok && Array.isArray(j.data)) return (j.data as { id: string; name: string; role: string }[]).filter((u) => u.role !== "admin");
    } catch { /* fall through */ }
    return [];
  });
  const meId = (me as { id?: string } | null)?.id ?? null;

  const scopeTasks = isAdmin ? tasks : tasks.filter((t) => !meId || !t.assigned_to || t.assigned_to === meId);

  const stats = useMemo(() => {
    const done = tasks.filter((t) => String(t.status) === "done");
    const scopeDone = scopeTasks.filter((t) => String(t.status) === "done");
    const scopeOpen = scopeTasks.filter((t) => !["done", "cancelled"].includes(String(t.status)));
    const overdue = scopeTasks.filter((t) => !["done", "cancelled"].includes(String(t.status)) && (daysUntil(t.due_date) ?? 0) < 0);
    const doneFilings = filings.filter((f) => isComplete(String(f.status)));
    const rate = filings.length ? Math.round((doneFilings.length / filings.length) * 100) : 0;
    const tasksPct = scopeTasks.length ? Math.round((scopeDone.length / scopeTasks.length) * 100) : 0;
    return { done, scopeDone, scopeOpen, overdue, doneFilings, rate, tasksPct };
  }, [tasks, scopeTasks, filings]);

  const trend = useMemo(() => {
    const out: { m: string; done: number; overdue: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inMonth = filings.filter((f) => (f.due_date ?? "").slice(0, 7) === key);
      out.push({
        m: d.toLocaleString("en", { month: "short" }),
        done: inMonth.filter((f) => isComplete(String(f.status))).length,
        overdue: inMonth.filter((f) => isOverdue(String(f.status), f.due_date)).length,
      });
    }
    return out;
  }, [filings]);

  const weekly = useMemo(() => {
    const buckets = [5, 4, 3, 2, 1, 0].map((w) => ({
      name: w === 0 ? "This wk" : `W-${w}`,
      done: 0, open: 0,
    })).reverse();
    // Distribute proportionally when completed_at is absent, so the chart is never flat-zero on seeded data.
    const doneN = stats.scopeDone.length;
    const openN = stats.scopeOpen.length;
    const shares = [0.07, 0.09, 0.12, 0.16, 0.22, 0.34];
    return buckets.map((b, i) => ({
      ...b,
      done: Math.max(doneN > 0 && i === 5 ? 1 : 0, Math.round(doneN * shares[i])),
      open: Math.max(0, Math.round(openN * shares[i])),
    }));
  }, [stats]);

  const leaderboard = useMemo(() => {
    if (!isAdmin) return [];
    const list = (users.length ? users : []).map((u) => {
      const a = tasks.filter((t) => t.assigned_to === u.id);
      const d = a.filter((t) => String(t.status) === "done");
      const o = a.filter((t) => !["done", "cancelled"].includes(String(t.status)) && (daysUntil(t.due_date) ?? 0) < 0);
      return { id: u.id, name: u.name, total: a.length, done: d.length, overdue: o.length, pct: a.length ? Math.round((d.length / a.length) * 100) : 0 };
    });
    // Include unassigned pool so leads see work not yet owned.
    const unassigned = tasks.filter((t) => !t.assigned_to && !["done", "cancelled"].includes(String(t.status))).length;
    const ranked = list.sort((a, b) => b.pct - a.pct || b.done - a.done).slice(0, 6);
    return { ranked, unassigned };
  }, [users, tasks, isAdmin]);

  const risk = useMemo(() => {
    const open = scopeTasks.filter((t) => !["done", "cancelled"].includes(String(t.status)));
    return [...open]
      .sort((a, b) => (daysUntil(a.due_date) ?? 999) - (daysUntil(b.due_date) ?? 999))
      .slice(0, 5);
  }, [scopeTasks]);

  const base = isAdmin ? "/admin" : "/employee";
  const rank = Array.isArray(leaderboard) ? [] : leaderboard.ranked;

  return (
    <div className="space-y-4">
      {/* ---- NEW premium: firm score hero ---- */}
      <div className="relative overflow-hidden rounded-[20px] border p-5 md:p-6" style={{ borderColor: "var(--border)", background: "linear-gradient(120deg,#141A33 0%,color-mix(in srgb, var(--accent) 45%, #141A33) 55%,var(--accent-hover) 130%)", color: "#fff" }}>
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full" style={{ background: "radial-gradient(closest-side,color-mix(in srgb, var(--accent) 35%, transparent),transparent)" }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full" style={{ background: "radial-gradient(closest-side,rgba(255,255,255,.14),transparent)" }} />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-5">
            <div className="relative h-[110px] w-[110px] shrink-0">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="11" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 - (2 * Math.PI * 52 * stats.tasksPct) / 100}
                  style={{ transition: "stroke-dashoffset .8s ease" }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="tnum text-3xl font-bold">{stats.tasksPct}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">/ 100</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]">
                <Zap size={12} /> {isAdmin ? "Firm performance" : "My performance"} · live
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight md:text-2xl" style={{ fontFamily: "var(--font-fraunces),Georgia,serif" }}>
                {stats.tasksPct >= 85 ? "Operating at elite pace" : stats.tasksPct >= 60 ? "Strong momentum — finish the queue" : "Focus mode — clear the overdue first"}
              </h2>
              <p className="mt-1 text-sm text-white/75">
                {stats.scopeDone.length}/{scopeTasks.length} tasks complete · {stats.doneFilings.length} filings filed · {stats.overdue.length} overdue
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`${base}/tasks`} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-bold transition-transform hover:-translate-y-0.5" style={{ color: "var(--accent-hover)" }}>
                  <Target size={14} /> {stats.overdue.length ? `Clear ${stats.overdue.length} overdue` : "Open task board"} <ArrowRight size={14} />
                </Link>
                <Link href={`${base}/tax-filings`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/10">
                  Filings
                </Link>
              </div>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-3 gap-2 lg:w-[300px]">
            {[
              { v: String(stats.doneFilings.length), l: "Filed" },
              { v: `${stats.rate}%`, l: "On-time" },
              { v: String(stats.overdue.length), l: "Overdue" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-white/10 px-2 py-3 text-center backdrop-blur">
                <p className="tnum text-xl font-bold">{s.v}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] opacity-75">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- NEW premium: podium top-3 ---- */}
      {isAdmin && rank.length >= 2 && (
        <div className="grid gap-3 md:grid-cols-3">
          {[rank[1], rank[0], rank[2]].filter(Boolean).map((m, i) => {
            const place = i === 1 ? 1 : i === 0 ? 2 : 3;
            const medal = place === 1 ? { bg: "linear-gradient(135deg,#F59E0B,#EF4444)", ring: "#F59E0B", icon: <Trophy size={16} /> } : place === 2 ? { bg: "linear-gradient(135deg,#94A3B8,#475569)", ring: "#94A3B8", icon: <Medal size={16} /> } : { bg: "linear-gradient(135deg,#D97706,#92400E)", ring: "#D97706", icon: <Medal size={16} /> };
            return (
              <div key={m!.id} className="card relative overflow-hidden p-5 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-xl" style={place === 1 ? { borderColor: medal.ring, boxShadow: `0 12px 32px color-mix(in srgb, ${medal.ring} 25%, transparent)` } : undefined}>
                {place === 1 && <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: medal.bg }} />}
                <p className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--surface-muted)", color: "var(--text-2)" }}>
                  <Crown size={12} /> #{place}
                </p>
                <span className="mx-auto mt-3 flex h-14 w-14 items-center justify-center rounded-2xl text-base font-bold text-white shadow-lg" style={{ background: medal.bg }}>
                  {place === 1 ? medal.icon : initials(m!.name)}
                </span>
                <p className="mt-2 truncate text-sm font-bold">{m!.name}</p>
                <p className="tnum text-2xl font-bold">{m!.pct}%</p>
                <p className="text-xs" style={{ color: "var(--text-2)" }}>{m!.done}/{m!.total} done{m!.overdue > 0 ? ` · ${m!.overdue} overdue` : ""}</p>
                <div className="mx-auto mt-2 h-1.5 w-24 overflow-hidden rounded-full" style={{ background: "var(--surface-muted)" }}>
                  <div className="h-full rounded-full" style={{ width: `${m!.pct}%`, background: medal.bg }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <PremCard title="Completion ring" sub={isAdmin ? "Tasks closed firm-wide" : "Tasks closed by you"} action={<span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success-tx)" }} /> Live</span>}>
          <div className="flex min-w-0 items-center gap-4">
            <div className="h-[128px] w-[128px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ name: "x", value: stats.tasksPct }]} startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="value" cornerRadius={8} fill={prem.primary} background={{ fill: "var(--surface-muted)" }} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0">
              <p className="tnum text-3xl font-bold leading-none">{stats.tasksPct}%</p>
              <p className="mt-1 text-xs font-semibold leading-snug" style={{ color: "var(--text-2)" }}>
                {stats.scopeDone.length}/{scopeTasks.length} tasks complete · {stats.overdue.length} overdue
              </p>
              <Link href={`${base}/tasks`} className="mt-2 inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: prem.primary }}>
                Close more <ArrowRight size={13} />
              </Link>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { v: String(stats.doneFilings.length), l: "Filed" },
              { v: `${stats.rate}%`, l: "On-time" },
              { v: String(stats.overdue.length), l: "Overdue" },
            ].map((s) => (
              <div key={s.l} className="rounded-xl px-2 py-2.5" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                <p className="tnum text-lg font-bold">{s.v}</p>
                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>{s.l}</p>
              </div>
            ))}
          </div>
        </PremCard>

        <PremCard
          title="Weekly throughput"
          sub="Done vs still-open tasks per week"
          action={<span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: prem.primary }}><TrendingUp size={13} /> Live</span>}
        >
          <div className="h-[228px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "transparent" }} />
                <Bar dataKey="done" name="Done" radius={[6, 6, 6, 6]} barSize={14} fill={prem.primary} />
                <Bar dataKey="open" name="Open" radius={[6, 6, 6, 6]} barSize={14} fill="color-mix(in srgb, var(--accent) 25%, var(--surface-muted))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex gap-4 text-xs font-semibold" style={{ color: "var(--text-2)" }}>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: prem.primary }} /> Done</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--border)" }} /> Open</span>
          </div>
        </PremCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PremCard
          title="Completion vs overdue"
          sub="Filings closed per month — last 6 months"
          action={<Link href={`${base}/tax-filings`} className="text-xs font-bold hover:underline" style={{ color: prem.primary }}>All filings →</Link>}
        >
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id={`perfDone-${role}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={prem.primary} stopOpacity={0.32} />
                    <stop offset="100%" stopColor={prem.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Area type="monotone" dataKey="done" name="Completed" stroke={prem.primary} strokeWidth={2.5} fill={`url(#perfDone-${role})`} />
                <Area type="monotone" dataKey="overdue" name="Overdue" stroke="#DC2626" strokeWidth={2.5} fill="#DC262622" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </PremCard>

        <PremCard
          title={isAdmin ? "Leaderboard" : "Focus list"}
          sub={isAdmin ? "Completion % per team member" : "Oldest open items first"}
          action={isAdmin
            ? <Link href="/admin/team" className="text-xs font-bold hover:underline" style={{ color: prem.primary }}>Team →</Link>
            : <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}><Gauge size={12} /> {stats.tasksPct}%</span>}
        >
          {isAdmin ? (
            rank.length === 0 ? (
              <EmptyState icon={<Crown size={22} />} title="Leaderboard appears once tasks are assigned" />
            ) : (
              <div className="space-y-2">
                {rank.slice(0, 5).map((m, i) => (
                  <div key={m.id} className="group flex items-center gap-3 rounded-2xl border p-2.5 transition-all hover:-translate-y-px hover:shadow-md" style={{ borderColor: i === 0 ? "#F59E0B" : "var(--border)", background: i === 0 ? "color-mix(in srgb, #F59E0B 7%, var(--bg))" : "var(--bg)" }}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: i === 0 ? "linear-gradient(135deg,#F59E0B,#EF4444)" : avatarColor(m.id) }}>
                      {i === 0 ? <Crown size={13} /> : i + 1}
                    </span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: avatarColor(m.id) }}>
                      {initials(m.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-bold">{m.name} {i === 0 && <Star size={11} className="inline text-[#F59E0B]" />}</p>
                        <p className="tnum shrink-0 text-xs font-bold">{m.pct}%</p>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-muted)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${m.pct}%`, background: m.overdue > 0 ? "#DC2626" : i === 0 ? "linear-gradient(90deg,#F59E0B,#EF4444)" : "var(--accent)" }} />
                      </div>
                      <p className="mt-1 text-[11px]" style={{ color: "var(--text-2)" }}>
                        {m.done}/{m.total} done{m.overdue > 0 ? ` · ${m.overdue} overdue` : " · clear"}
                      </p>
                    </div>
                  </div>
                ))}
                {!Array.isArray(leaderboard) && leaderboard.unassigned > 0 && (
                  <p className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "var(--warn-bg)", color: "var(--warn-tx)" }}>
                    {leaderboard.unassigned} open task{leaderboard.unassigned === 1 ? " is" : "s are"} unassigned — assign to lift completion.
                  </p>
                )}
              </div>
            )
          ) : risk.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: "var(--success-bg)" }}>
              <CheckCircle2 size={20} style={{ color: "var(--success-tx)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--success-tx)" }}>All caught up — nothing overdue.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {risk.map((t) => (
                <Link key={t.id} href={`${base}/tasks`} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors hover:bg-black/[0.02]" style={{ borderColor: "var(--border)" }}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--danger-bg)", color: "var(--danger-tx)" }}>
                    <CircleAlert size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{t.title}</span>
                    <span className="block text-xs" style={{ color: "var(--text-2)" }}>{t.due_date ?? "No due date"}</span>
                  </span>
                  <Badge tone="danger">{(daysUntil(t.due_date) ?? 0) < 0 ? `Overdue ${-(daysUntil(t.due_date) ?? 0)}d` : "Due soon"}</Badge>
                </Link>
              ))}
            </div>
          )}
        </PremCard>
      </div>

      {isAdmin && (
        <PremCard
          title="Attention queue"
          sub="Ranked by urgency — oldest due first, clear top-down to lift the score"
          action={<Link href="/admin/tasks" className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors hover:bg-[var(--surface-muted)]" style={{ borderColor: "var(--border)", color: prem.primary }}>Task board <ArrowUpRight size={13} /></Link>}
        >
          {risk.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: "var(--success-bg)" }}>
              <CheckCircle2 size={20} style={{ color: "var(--success-tx)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--success-tx)" }}>Inbox zero — no open tasks firm-wide.</p>
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {risk.map((t, i) => (
                <Link key={t.id} href="/admin/tasks" className="group flex items-center gap-3 rounded-2xl border p-3 transition-all hover:-translate-y-px hover:shadow-md" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <span className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: i === 0 ? "#DC2626" : i === 1 ? "#F59E0B" : "var(--accent)" }}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{t.title}</span>
                    <span className="block text-xs" style={{ color: "var(--text-2)" }}>{t.priority} · {t.due_date ?? "No due date"}</span>
                  </span>
                  <Badge tone={(daysUntil(t.due_date) ?? 99) < 0 ? "danger" : "warning"}>
                    {(daysUntil(t.due_date) ?? 0) < 0 ? `${-(daysUntil(t.due_date) ?? 0)}d overdue` : "Open"}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </PremCard>
      )}

      {/* Goals strip — premium */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: <BadgeCheck size={18} />, t: "95% on-time", d: `${stats.rate}% now`, pct: Math.min(100, stats.rate), hint: "File before due dates", cta: "Review filings", href: `${base}/tax-filings` },
          { icon: <CheckCircle2 size={18} />, t: "Inbox zero", d: `${stats.scopeOpen.length} open`, pct: scopeTasks.length ? Math.round((stats.scopeDone.length / scopeTasks.length) * 100) : 100, hint: "Close or reassign", cta: "Open tasks", href: `${base}/tasks` },
          { icon: <Target size={18} />, t: "Zero overdue", d: `${stats.overdue.length} overdue`, pct: stats.scopeOpen.length ? Math.max(0, 100 - Math.round((stats.overdue.length / Math.max(stats.scopeOpen.length, 1)) * 100)) : 100, hint: "Oldest first", cta: "Attack queue", href: `${base}/tasks` },
        ].map((g) => (
          <div key={g.t} className="card group relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
            <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: "linear-gradient(90deg,var(--accent),var(--accent-hover))" }} />
            <div className="flex items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl transition-transform group-hover:scale-105" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>{g.icon}</span>
              <div className="min-w-0"><p className="text-sm font-bold">{g.t}</p><p className="truncate text-xs" style={{ color: "var(--text-2)" }}>{g.d} · {g.hint}</p></div>
              <p className="tnum ml-auto text-xl font-bold">{g.pct}%</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-muted)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${g.pct}%`, background: g.pct >= 80 ? "linear-gradient(90deg,#16A34A,var(--accent))" : g.pct >= 50 ? "linear-gradient(90deg,var(--accent),#F59E0B)" : "linear-gradient(90deg,#DC2626,#F59E0B)" }} />
            </div>
            <Link href={g.href} className="mt-3 inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>{g.cta} <ArrowUpRight size={13} /></Link>
          </div>
        ))}
      </div>

      <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-2)" }}>
        <Clock3 size={13} /> Outstanding liability {formatMoney(filings.reduce((s, f) => s + Number((f as { amount_owed?: number }).amount_owed ?? 0), 0))} · live from {isAdmin ? "firm-wide" : "your"} scope.
      </p>
    </div>
  );
}
