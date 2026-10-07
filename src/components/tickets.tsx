"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { LifeBuoy, Plus, Search, Download, Trash2, Send, X, Paperclip } from "lucide-react";
import { Card, Button, Badge, EmptyState, Modal, DataTable } from "./ui";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser, useFilings, useMyClient, useUsers } from "@/lib/hooks";
import {
  CLIENT_CATEGORIES, EMPLOYEE_CATEGORIES, PRIORITY_TONE, STATUS_BADGE_STYLE,
  TICKET_PRIORITIES, TICKET_STATUSES,
  canCloseTicket, canReopen, type Ticket, type TicketComment, type TicketHistoryRow,
} from "@/lib/tickets";

type Role = "admin" | "employee" | "client";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: unknown })?.error ? String((j as { error: unknown }).error) : `Request failed (${res.status})`);
  return j as { data?: unknown };
}

export function TicketStatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE_STYLE[status] ?? { background: "var(--surface-muted)", color: "var(--text)" };
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: s.background, color: s.color }}>
      {status}
    </span>
  );
}

export function useTicketStats() {
  return useSWR("tickets-stats", async () => {
    const j = await api("/api/tickets/stats");
    return (j.data ?? {}) as Record<string, number>;
  });
}

export function useTickets(params?: { status?: string; source?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.source && params.source !== "all") qs.set("source", params.source);
  if (params?.search?.trim()) qs.set("search", params.search.trim());
  const key = `tickets?${qs.toString()}`;
  const swr = useSWR<Ticket[]>(key, async () => {
    const j = await api(`/api/tickets?${qs.toString()}`);
    return (j.data ?? []) as Ticket[];
  });
  return swr;
}

export function useTicketDetail(id: string | null) {
  return useSWR(id ? `ticket:${id}` : null, async () => {
    const j = await api(`/api/tickets/${id}`);
    return j.data as Ticket & { comments: TicketComment[]; history: TicketHistoryRow[] };
  });
}

/* ---------------- Create form ---------------- */

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";
const MAX_FILE = 5 * 1024 * 1024;

function storagePath(userId: string | undefined, fileName: string): string {
  const stamp = new Date().getTime().toString();
  return `${userId ?? "anon"}/${stamp}-${fileName}`.replace(/[^a-zA-Z0-9._/-]/g, "_");
}

export function CreateTicketForm({ role, onCreated }: { role: Role; onCreated?: (t: Ticket) => void }) {
  const { data: me } = useCurrentUser();
  const { data: myClient } = useMyClient();
  const { data: filings = [] } = useFilings();
  const [form, setForm] = useState({ subject: "", category: "", project_label: "", priority: "Medium", description: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const categories = role === "client" ? CLIENT_CATEGORIES : role === "employee" ? EMPLOYEE_CATEGORIES : [...CLIENT_CATEGORIES, ...EMPLOYEE_CATEGORIES];
  const projects = useMemo(() => {
    if (role !== "client") return [];
    return filings.map((f) => `${f.tax_type} ${f.period ?? ""}`.trim()).filter(Boolean).slice(0, 50);
  }, [filings, role]);

  async function uploadIfNeeded(): Promise<{ url?: string; name?: string }> {
    if (!file) return {};
    if (file.size > MAX_FILE) throw new Error("Attachment must be 5 MB or less.");
    const okType = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!okType) throw new Error("Attachments must be images or PDFs.");
    const sb = createClient();
    if (!sb) throw new Error("Storage not configured — ticket will be created without the file.");
    const path = storagePath((me as { id?: string } | null)?.id, file.name);
    const { error } = await sb.storage.from("ticket-attachments").upload(path, file);
    if (error) throw new Error(error.message);
    const { data } = sb.storage.from("ticket-attachments").getPublicUrl(path);
    return { url: data.publicUrl, name: file.name };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg({});
    if (form.subject.trim().length < 5) { setMsg({ err: "Subject needs at least 5 characters." }); return; }
    if (!form.description.trim()) { setMsg({ err: "Problem description is required." }); return; }
    setBusy(true);
    try {
      const up = await uploadIfNeeded();
      const j = await api("/api/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject: form.subject.trim(),
          category: form.category || categories[0],
          project_label: role === "client" ? (form.project_label || null) : null,
          priority: form.priority,
          description: form.description.trim(),
          attachment_url: up.url ?? null,
          attachment_name: up.name ?? null,
        }),
      });
      const t = j.data as Ticket;
      setMsg({ ok: `Ticket ${t.ticket_no} created — status: Open. The support team has been notified.` });
      setForm({ subject: "", category: "", project_label: "", priority: "Medium", description: "" });
      setFile(null);
      onCreated?.(t);
    } catch (err) {
      setMsg({ err: err instanceof Error ? err.message : "Could not create ticket." });
    } finally { setBusy(false); }
  }

  const input: React.CSSProperties = { borderColor: "var(--border)", background: "var(--bg)" };
  const meAny = me as { name?: string; role?: string; id?: string } | null;
  return (
    <form onSubmit={submit} className="space-y-3">
      {/* auto-filled creator, read-only */}
      <div className="grid gap-2 rounded-xl border p-3 text-xs sm:grid-cols-3" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <span><strong>Name:</strong> {meAny?.name ?? (myClient as { name?: string } | null)?.name ?? "…"}</span>
        <span><strong>{role === "client" ? "Company:" : "ID:"}</strong> {(myClient as { business_name?: string; email?: string } | null)?.business_name ?? (myClient as { email?: string } | null)?.email ?? meAny?.id?.slice(0, 8) ?? "…"}</span>
        <span><strong>Email:</strong> {(myClient as { email?: string } | null)?.email ?? "from your account"}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject (min 5 characters)"
          className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none md:col-span-2" style={input} required />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={input} required>
          <option value="">Choose category</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
          className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={input}>
          {TICKET_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        {role === "client" && (
          <select value={form.project_label} onChange={(e) => setForm({ ...form, project_label: e.target.value })}
            className="w-full rounded-[10px] border px-3 py-2.5 text-sm md:col-span-2" style={input}>
            <option value="">Project / Service (optional)</option>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>
      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="Describe the problem in detail…" rows={5}
        className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={input} required />
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
        <Paperclip size={15} />
        <input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
        <span className="text-xs">Optional · image/PDF · max 5 MB{file ? ` · ${file.name}` : ""}</span>
      </label>
      {msg.err && <p role="alert" className="text-sm text-[#DC2626]">{msg.err}</p>}
      {msg.ok && <p role="status" className="text-sm font-semibold" style={{ color: "var(--accent-hover)" }}>{msg.ok}</p>}
      <Button disabled={busy} className="w-full sm:w-auto"><Plus size={15} /> {busy ? "Creating…" : "Create ticket"}</Button>
    </form>
  );
}

/* ---------------- Table ---------------- */

export function TicketsTable({ rows, onOpen, showSource }: { rows: Ticket[]; onOpen: (t: Ticket) => void; showSource?: boolean }) {
  const idx = rows;
  return (
    <DataTable
      columns={["Ticket", "Subject", ...(showSource ? ["Source"] : []), "Priority", "Status", "Updated"]}
      emptyText="No tickets yet"
      onRowClick={(i) => onOpen(idx[i])}
      rows={idx.map((t) => [
        <span key="n" className="font-bold">{t.ticket_no}</span>,
        <span key="s"><span className="block max-w-[280px] truncate font-semibold">{t.subject}</span>
          <span className="text-xs" style={{ color: "var(--text-2)" }}>{t.category}{t.project_label ? ` · ${t.project_label}` : ""}</span></span>,
        ...(showSource ? [<Badge key="src" tone={t.created_by_role === "client" ? "accent" : "neutral"}>{t.created_by_role === "client" ? "Client" : "Employee"}</Badge>] : []),
        <Badge key="p" tone={PRIORITY_TONE[String(t.priority)] ?? "neutral"}>{String(t.priority)}</Badge>,
        <span key="st"><TicketStatusBadge status={String(t.status)} /></span>,
        <span key="u" className="text-xs">{t.updated_at ? new Date(t.updated_at).toLocaleDateString() : "—"}</span>,
      ])}
    />
  );
}

/* ---------------- Detail ---------------- */

export function TicketDetail({ ticketId, role, onClose, onChanged }: { ticketId: string; role: Role; onClose: () => void; onChanged: () => void }) {
  const { data: d, mutate, isLoading, error } = useTicketDetail(ticketId);
  const { data: users = [] } = useUsers();
  const { data: me } = useCurrentUser();
  const meId = (me as { id?: string } | null)?.id ?? "";
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [statusSel, setStatusSel] = useState("");
  const [assignee, setAssignee] = useState("");
  const [remark, setRemark] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const employees = users.filter((u) => ["employee", "admin"].includes(u.role));

  async function run(fn: () => Promise<unknown>, ok?: () => void) {
    setBusy(true); setErr("");
    try { await fn(); await mutate(); onChanged(); ok?.(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Action failed."); }
    finally { setBusy(false); }
  }

  if (isLoading) return <Modal open onClose={onClose} title="Ticket" size="xl"><div className="skeleton h-40" /></Modal>;
  if (error || !d) return <Modal open onClose={onClose} title="Ticket"><p className="text-sm text-[#DC2626]">{error?.message ?? "Not found."}</p></Modal>;

  const closed = d.status === "Closed";
  const iCanClose = canCloseTicket(d, { id: meId, role });
  const reopenable = closed && canReopen(d.closed_at);
  const staff = role !== "client";
  const publicComments = d.comments.filter((c) => staff || !c.is_internal);

  return (
    <Modal open onClose={onClose} title={`${d.ticket_no} — ${d.subject}`} size="xl">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <TicketStatusBadge status={String(d.status)} />
          <Badge tone={PRIORITY_TONE[String(d.priority)] ?? "neutral"}>{String(d.priority)}</Badge>
          <Badge>{d.category}</Badge>
          {role === "admin" && <Badge tone={d.created_by_role === "client" ? "accent" : "neutral"}>{String(d.created_by_role)}</Badge>}
          <span className="ml-auto text-xs" style={{ color: "var(--text-2)" }}>
            Opened {d.created_at ? new Date(d.created_at).toLocaleString() : "—"}
          </span>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
          <p className="eyebrow mb-1">Problem</p>
          <p className="whitespace-pre-wrap leading-relaxed">{d.description}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-2)" }}>
            <span>By {d.creator_name ?? "—"}</span>
            {d.project_label ? <span>Project: {d.project_label}</span> : null}
            {d.assigned_name ? <span>Assigned: {d.assigned_name}</span> : <span>Unassigned</span>}
            {d.attachment_url ? <a href={String(d.attachment_url)} target="_blank" rel="noopener" className="font-bold text-[var(--accent)] hover:underline">📎 {d.attachment_name ?? "Attachment"}</a> : null}
          </div>
          {closed && <p className="mt-2 text-xs">Closed by {d.closed_by ? "staff" : "—"} · {d.closed_at ? new Date(d.closed_at).toLocaleString() : ""}{d.closing_remark ? ` · “${d.closing_remark}”` : ""}</p>}
        </div>

        {/* comment thread (internal notes staff-only; hidden from clients by API) */}
        <div>
          <p className="eyebrow mb-2">Discussion ({publicComments.length})</p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {publicComments.length === 0 && <p className="text-xs" style={{ color: "var(--text-2)" }}>No replies yet.</p>}
            {publicComments.map((c) => (
              <div key={c.id} className="rounded-xl border px-3 py-2" style={{ borderColor: c.is_internal ? "#F59E0B" : "var(--border)", background: c.is_internal ? "var(--warn-bg)" : "var(--bg)" }}>
                <p className="flex items-center gap-2 text-xs font-bold">
                  {c.user_name ?? "User"} {c.is_internal && <Badge tone="warning">internal</Badge>}
                  <span className="font-normal" style={{ color: "var(--text-2)" }}>{c.created_at ? new Date(c.created_at).toLocaleString() : ""}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap">{c.message}</p>
              </div>
            ))}
          </div>
          {!closed && (
            <div className="mt-2 flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…"
                className="min-w-0 flex-1 rounded-[10px] border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
              {staff && (
                <label className="flex items-center gap-1 text-xs" title="Only staff see internal notes">
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> internal
                </label>
              )}
              <Button disabled={busy || !reply.trim()} onClick={() => run(async () => {
                await api(`/api/tickets/${d.id}/comments`, { method: "POST", body: JSON.stringify({ message: reply.trim(), is_internal: staff && internal }) });
                setReply(""); setInternal(false);
              })}><Send size={14} /> Reply</Button>
            </div>
          )}
        </div>

        {/* status timeline */}
        <div>
          <p className="eyebrow mb-2">Timeline</p>
          <div className="space-y-1.5">
            {d.history.length === 0 && <p className="text-xs" style={{ color: "var(--text-2)" }}>Created — no changes yet.</p>}
            {d.history.map((h) => (
              <div key={h.id} className="flex flex-wrap gap-2 text-xs">
                <span className="font-bold">{h.action.replace(/_/g, " ")}</span>
                {h.old_value || h.new_value ? <span style={{ color: "var(--text-2)" }}>{h.old_value ?? ""} → {h.new_value ?? ""}</span> : null}
                <span style={{ color: "var(--text-2)" }}>by {h.changed_by_name ?? "—"} · {h.created_at ? new Date(h.created_at).toLocaleString() : ""}</span>
              </div>
            ))}
          </div>
        </div>

        {err && <p role="alert" className="text-sm text-[#DC2626]">{err}</p>}

        {/* actions */}
        {!closed && staff && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <select value={statusSel} onChange={(e) => setStatusSel(e.target.value)}
              className="rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <option value="">Change status…</option>
              {TICKET_STATUSES.filter((s) => !["Closed"].includes(s)).map((s) => <option key={s}>{s}</option>)}
            </select>
            <Button variant="ghost" disabled={busy || !statusSel} onClick={() => run(async () => {
              await api(`/api/tickets/${d.id}/status`, { method: "PATCH", body: JSON.stringify({ status: statusSel }) });
              setStatusSel("");
            })}>Apply</Button>
            {role === "admin" && (
              <>
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)}
                  className="rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <option value="">Assign to…</option>
                  <option value="__none">Unassigned</option>
                  {employees.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
                <Button variant="ghost" disabled={busy || !assignee} onClick={() => run(async () => {
                  await api(`/api/tickets/${d.id}/assign`, { method: "PATCH", body: JSON.stringify({ assigned_to: assignee === "__none" ? null : assignee }) });
                  setAssignee("");
                })}>Assign</Button>
              </>
            )}
          </div>
        )}

        {/* close (staff permitted by creator-role rule) */}
        {!closed && iCanClose && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Closing remark (required)…"
              className="min-w-[200px] flex-1 rounded-[10px] border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <Button variant="danger" disabled={busy || remark.trim().length < 3} onClick={() => run(async () => {
              await api(`/api/tickets/${d.id}/close`, { method: "PATCH", body: JSON.stringify({ closing_remark: remark.trim() }) });
            })}>Close ticket</Button>
          </div>
        )}
        {!closed && !iCanClose && role !== "admin" && (
          <p className="text-xs" style={{ color: "var(--text-2)" }}>
            {d.created_by_role === "employee" ? "Only an admin can close employee tickets — you can reply and track status here." : "Support staff will close this ticket once resolved — you can reply and track status here."}
          </p>
        )}
        {closed && (
          <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-2)" }}>
            <span>This ticket is read-only.</span>
            {reopenable && (
              <Button variant="ghost" disabled={busy} onClick={() => run(async () => {
                await api(`/api/tickets/${d.id}/close`, { method: "PATCH", body: JSON.stringify({ reopen: true }) });
              })}>Reopen (within 7 days)</Button>
            )}
          </div>
        )}
        {role === "admin" && (
          <div className="flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            {confirmDelete ? (
              <span className="flex gap-2 text-xs">
                <button className="font-bold text-[#DC2626]" disabled={busy} onClick={() => run(async () => {
                  await api(`/api/tickets/${d.id}`, { method: "DELETE" });
                }, onClose)}>Confirm delete</button>
                <button onClick={() => setConfirmDelete(false)}>Cancel</button>
              </span>
            ) : (
              <button className="flex items-center gap-1 text-xs font-semibold text-[#DC2626]" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} /> Delete ticket
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Help center per role ---------------- */

function toCSV(rows: Ticket[]): string {
  const head = "ticket_no,source,subject,category,priority,status,assigned,created,updated";
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [head, ...rows.map((t) => [
    t.ticket_no, t.created_by_role, t.subject, t.category, t.priority, t.status,
    t.assigned_name ?? "", t.created_at ?? "", t.updated_at ?? "",
  ].map(esc).join(","))].join("\n");
}

function Frame({ framed, children }: { framed: boolean; children: React.ReactNode }) {
  return framed ? <Card>{children}</Card> : <>{children}</>;
}

export function TicketHelpCenter({ role, framed = true }: { role: Role; framed?: boolean }) {
  const { data: me } = useCurrentUser();
  const meId = (me as { id?: string } | null)?.id ?? "";
  const [tab, setTab] = useState<"create" | "mine" | "clients" | "manage">("mine");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: stats, mutate: mutateStats } = useTicketStats();
  const { data: tickets = [], isLoading, mutate } = useTickets(role === "admin" ? { status, source, search } : { status, search });

  const mine = tickets.filter((t) => t.created_by_id === meId);
  const clientPool = tickets.filter((t) => t.created_by_role === "client");
  const shown = tab === "mine" ? mine : tab === "clients" ? clientPool : tickets;

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "create", label: "Create Ticket" },
    { key: "mine", label: "My Tickets" },
    ...(role === "employee" ? [{ key: "clients" as const, label: "Client Tickets" }] : []),
    ...(role === "admin" ? [{ key: "manage" as const, label: "Ticket Management" }] : []),
  ];

  function refresh() { void mutate(); void mutateStats(); }

  function exportCSV() {
    const blob = new Blob([toCSV(shown)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div className="space-y-4">
      {role === "admin" && (
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[["Total", stats?.total ?? 0], ["Open", stats?.open ?? 0], ["In Progress", stats?.in_progress ?? 0],
            ["On Hold", stats?.on_hold ?? 0], ["Resolved", stats?.resolved ?? 0], ["Closed", stats?.closed ?? 0]].map(([k, v]) => (
            <Card key={k as string}><p className="eyebrow">{k}</p><p className="tnum mt-1 text-2xl font-bold">{v}</p></Card>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${tab === t.key ? "text-white" : ""}`}
            style={tab === t.key ? { background: "var(--accent)" } : { border: "1px solid var(--border)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "create" && (
        <Frame framed={framed}>
          <h3 className="mb-1 flex items-center gap-2 text-base font-bold"><LifeBuoy size={17} /> Create a ticket</h3>
          <p className="mb-4 text-xs" style={{ color: "var(--text-2)" }}>
            {role === "client" ? "Visible to support staff — they will update status, reply and close it." : role === "employee" ? "Visible only to you and admins — only an admin can close it." : "Admin tickets behave like client tickets for numbering."}
          </p>
          <CreateTicketForm role={role} onCreated={refresh} />
        </Frame>
      )}

      {tab !== "create" && (
        <Frame framed={framed}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-[10px] border px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
              <Search size={14} /> <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ID, subject…" className="w-full bg-transparent text-sm outline-none" />
              {search && <button onClick={() => setSearch("")} aria-label="Clear"><X size={14} /></button>}
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-[10px] border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              {["all", ...TICKET_STATUSES].map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
            </select>
            {role === "admin" && (
              <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-[10px] border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                {[["all", "All sources"], ["client", "Clients"], ["employee", "Employees"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
            {role === "admin" && <Button variant="ghost" onClick={exportCSV}><Download size={14} /> CSV</Button>}
          </div>
          {isLoading ? <div className="skeleton h-40" /> : shown.length === 0 ? (
            <EmptyState icon={<LifeBuoy size={22} />} title="No tickets yet" action={<Button onClick={() => setTab("create")}>Create one</Button>} />
          ) : (
            <TicketsTable rows={shown} onOpen={(t) => setOpenId(t.id)} showSource={role !== "client"} />
          )}
        </Frame>
      )}
      {openId && <TicketDetail ticketId={openId} role={role} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}
