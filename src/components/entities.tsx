"use client";
import { useMemo, useState } from "react";
import { Card, EmptyState, StatusBadge, Badge, Button, Modal, DataTable } from "./ui";
import { useClients, useFilings, useTasks, usePayments, useDocuments, useJurisdictions, useUsers, useReviewItems, useStaffInbox, useDocumentVersions } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { dueLabel, toCSV, downloadFile, exportPDF, formatMoney } from "@/lib/data";
import { FILING_STAGES, normalizeStage, displayStatus, nextStage, canAdvance, stageLabel, isOverdue } from "@/lib/lifecycle";
import { Users, FileText, CheckSquare, FolderOpen, CreditCard, Plus, Trash2, Send, Download, Eye, Check, X, History } from "lucide-react";
import { ClientDocumentsView } from "./smart-documents-client";
import type { DocRow, ChecklistItem } from "@/types/database";

function useRoleScope(role: string) {
  return { readOnly: false, role };
}

// ---------- Clients ----------
export function ClientsView({ role }: { role: "admin" | "employee" }) {
  const { data = [], mutate, isLoading } = useClients();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", business_name: "", entity_type: "LLC", tax_id: "" });
  const [confirm, setConfirm] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const sb = createClient();
    if (!sb) { setOpen(false); return; }
    const { error } = await sb.from("clients").insert([{ ...form, status: "active" }]);
    if (!error) { setOpen(false); mutate(); }
  }
  async function remove(id: string) {
    const sb = createClient();
    if (!sb) { setConfirm(null); return; }
    await sb.from("clients").delete().eq("id", id);
    setConfirm(null); mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div><h1 className="text-2xl font-bold">{role === "admin" ? "Clients" : "My Clients"}</h1>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>{role === "admin" ? "Firm-wide client directory" : "Clients assigned to you"}</p></div>
        <Button className="ml-auto" onClick={() => setOpen(true)}><Plus size={15} /> New Client</Button>
      </div>
      <Card>
        {isLoading ? <div className="skeleton h-40" /> : data.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title={role === "admin" ? "No clients yet — add your first client" : "No clients assigned to you yet"} action={<Button onClick={() => setOpen(true)}>Add client</Button>} />
        ) : (
          <DataTable columns={["Client", "Business", "Entity", "Status", "Actions"]} rows={data.map((c) => [
            <span key="n"><span className="font-semibold">{c.name}</span><br /><span className="text-xs" style={{ color: "var(--text-2)" }}>{c.email}</span></span>,
            <span key="b">{c.business_name ?? "—"}</span>,
            <span key="e">{c.entity_type ?? "—"}</span>,
            <span key="s"><StatusBadge status={c.status} /></span>,
            <span key="a">{confirm === c.id ? (
              <span className="flex gap-2"><button className="text-xs font-bold text-[#DC2626]" onClick={() => remove(c.id)}>Confirm delete</button><button className="text-xs" onClick={() => setConfirm(null)}>Cancel</button></span>
            ) : (
              <button className="btn-ghost px-2 py-1" onClick={() => setConfirm(c.id)} aria-label="Delete"><Trash2 size={14} /></button>
            )}</span>,
          ])} />
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New Client">
        <form onSubmit={create} className="space-y-3">
          {[["name", "Full name"], ["email", "Email"], ["business_name", "Business name"], ["tax_id", "Tax ID"]].map(([k, ph]) => (
            <input key={k} required={k === "name" || k === "email"} placeholder={ph} value={(form as Record<string, string>)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              className="w-full rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          ))}
          <select value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value })} className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            {["LLC", "S-Corp", "C-Corp", "Sole Prop", "Partnership"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <Button className="w-full">Create client</Button>
        </form>
      </Modal>
    </div>
  );
}

// ---------- Filings (7-stage lifecycle) ----------
export function FilingsView({ role }: { role: "admin" | "employee" | "client" }) {
  const { data = [], mutate, isLoading } = useFilings();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ tax_type: "VAT", period: "2026-Q3", due_date: "2026-10-31", amount_owed: "0" });
  const [advancing, setAdvancing] = useState<string | null>(null);

  const filtered = useMemo(() => filter === "all" ? data : data.filter((f) => normalizeStage(String(f.status)).includes(filter) || displayStatus(String(f.status), f.due_date) === filter), [data, filter]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const sb = createClient();
    if (!sb) { setOpen(false); return; }
    // Stage 1 Created — auto-creates task + client upload action item downstream
    const { error } = await sb.from("filings").insert([{ tax_type: form.tax_type, period: form.period, due_date: form.due_date, status: "created", amount_owed: Number(form.amount_owed), client_id: (data[0] as { client_id?: string })?.client_id ?? null }]);
    if (!error) { setOpen(false); mutate(); }
  }

  async function advance(filing: { id: string; status: string; due_date: string }, extra?: Record<string, unknown>) {
    if (!canAdvance(role, String(filing.status))) return;
    const nxt = nextStage(String(filing.status));
    if (!nxt) return;
    setAdvancing(filing.id);
    try {
      const sb = createClient();
      if (!sb) { mutate(); return; }
      const payload: Record<string, unknown> = { status: nxt, ...extra };
      if (nxt === "filed") payload.filed_at = new Date().toISOString();
      await sb.from("filings").update(payload).eq("id", filing.id);
      // Stage side-effects, mirrored server-side when Supabase is live:
      // documents_requested → client "upload documents" action item
      // in_preparation → record amount owed/refund
      // client_review → client "review and sign" action item, signature stored on sign
      // filed → fee invoice generated; completed → receipt downloadable
      await sb.from("activity_log").insert([{ action: `moved filing to ${nxt}`, entity_type: "filing", entity_id: filing.id }]);
      mutate();
    } finally { setAdvancing(null); }
  }

  async function escalate(id: string) {
    if (!window.confirm("Raise an escalation to the admin for this at-risk filing?")) return;
    const sb = createClient();
    if (!sb) return;
    await sb.from("escalations").insert([{ note: `Filing ${id} flagged at-risk`, status: "open", related_client_id: null }]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold">Tax Filings</h1>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>{role === "client" ? "Your filings and their live status" : "All filings with live status"}</p></div>
        {role !== "client" && <Button className="ml-auto" onClick={() => setOpen(true)}><Plus size={15} /> New Filing</Button>}
      </div>
      <div className="flex flex-wrap gap-2">
        {["all", "created", "documents_requested", "documents_received", "in_preparation", "client_review", "filed", "completed", "overdue"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === f ? "text-white" : ""}`}
            style={filter === f ? { background: "#2563EB" } : { background: "var(--surface)", border: "1px solid var(--border)" }}>{f.replace(/_/g, " ")}</button>
        ))}
      </div>
      <Card>
        {isLoading ? <div className="skeleton h-40" /> : filtered.length === 0 ? (
          <EmptyState icon={<FileText size={22} />} title="No filings found — create one to start tracking deadlines" action={role !== "client" ? <Button onClick={() => setOpen(true)}>New filing</Button> : undefined} />
        ) : (
          <DataTable columns={["Filing", "Period", "Due", "Status", "Owed", "Next"]} rows={filtered.map((f) => {
            const eff = displayStatus(String(f.status), f.due_date);
            const nxt = nextStage(String(f.status));
            return [
            <span key="f" className="font-semibold">{f.tax_type}</span>,
            <span key="p">{f.period}</span>,
            <span key="d"><Badge tone={isOverdue(String(f.status), f.due_date) ? "danger" : "warning"}>{dueLabel(f.due_date)}</Badge></span>,
            <span key="s" title={FILING_STAGES.find((s) => s.key === normalizeStage(String(f.status)))?.desc}><StatusBadge status={stageLabel(String(f.status), role === "client")} /></span>,
            <span key="o" className="tnum">{formatMoney(Number(f.amount_owed ?? 0))}</span>,
            <span key="n" className="flex gap-1">
              {nxt && canAdvance(role, String(f.status)) && eff !== "overdue" ? (
                <button disabled={advancing === f.id} onClick={() => advance(f)} className="rounded-lg px-2 py-1 text-xs font-bold text-white disabled:opacity-50" style={{ background: "#2563EB" }} title={FILING_STAGES.find((s) => s.key === nxt)?.desc}>
                  {advancing === f.id ? "…" : `→ ${stageLabel(nxt, role === "client")}`}
                </button>
              ) : eff === "overdue" ? <Badge tone="danger">Overdue</Badge> : <span className="text-xs" style={{ color: "var(--text-2)" }}>—</span>}
              {role === "employee" && eff !== "overdue" && <button onClick={() => escalate(f.id)} className="rounded-lg border px-2 py-1 text-xs font-semibold" style={{ borderColor: "var(--border)" }} title="Flag at-risk to admin">Escalate</button>}
            </span>,
            ];
          })} />
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New Filing">
        <form onSubmit={create} className="space-y-3">
          <select value={form.tax_type} onChange={(e) => setForm({ ...form, tax_type: e.target.value })} className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            {["VAT", "Corporate Tax", "Payroll", "Income Tax", "Sales Tax"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input placeholder="Period (e.g. 2026-Q3)" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <Button className="w-full">Create filing</Button>
        </form>
      </Modal>
    </div>
  );
}

// ---------- Tasks (Kanban with drag-drop) ----------
export function TasksView({ readOnlyWorkload = false }: { readOnlyWorkload?: boolean }) {
  const { data = [], mutate } = useTasks();
  const [dragId, setDragId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const cols: { key: string; label: string }[] = [
    { key: "todo", label: "Todo" }, { key: "in_progress", label: "In Progress" }, { key: "done", label: "Done" },
  ];

  async function move(id: string, status: string) {
    const sb = createClient();
    if (!sb) return;
    await sb.from("tasks").update({ status }).eq("id", id);
    mutate();
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const sb = createClient();
    if (!sb) { setOpen(false); return; }
    await sb.from("tasks").insert([{ title, status: "todo", priority: "medium" }]);
    setTitle(""); setOpen(false); mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div><h1 className="text-2xl font-bold">Task Management</h1><p className="text-sm" style={{ color: "var(--text-2)" }}>Drag cards between columns to change status</p></div>
        <Button className="ml-auto" onClick={() => setOpen(true)}><Plus size={15} /> New Task</Button>
      </div>
      {data.length === 0 ? (
        <Card><EmptyState icon={<CheckSquare size={22} />} title="No tasks yet — create your first task" action={<Button onClick={() => setOpen(true)}>New task</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {cols.map((c) => {
            const items = data.filter((t) => String(t.status) === c.key || (c.key === "todo" && !["in_progress", "done"].includes(String(t.status))));
            return (
              <div key={c.key} className="card min-h-[300px] p-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) { move(dragId, c.key); setDragId(null); } }}
                style={dragId ? { borderColor: "#2563EB" } : undefined}>
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold">{c.label} <Badge tone="accent">{items.length}</Badge></p>
                <div className="space-y-2">
                  {items.map((t) => (
                    <div key={t.id} draggable onDragStart={() => setDragId(t.id)}
                      className="cursor-grab rounded-xl border p-3 text-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                      style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
                      <p className="font-semibold">{t.title}</p>
                      <p className="mt-1 flex items-center gap-2 text-xs" style={{ color: "var(--text-2)" }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: t.priority === "high" ? "#DC2626" : t.priority === "medium" ? "#D97706" : "#16A34A" }} />
                        {t.priority} {t.due_date ? `· ${dueLabel(String(t.due_date))}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {readOnlyWorkload && (
        <Card><p className="eyebrow mb-2">Workload monitor (firm-wide, read-only)</p>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>{data.length} open tasks across the firm. Contact your admin to rebalance workload.</p></Card>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New Task">
        <form onSubmit={create} className="space-y-3">
          <input required placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <Button className="w-full">Create task</Button>
        </form>
      </Modal>
    </div>
  );
}

// ---------- Documents ----------
// Client role renders the upload-first Smart Documents view;
// employee/admin get the review workspace (country + tax + versions +
// review actions, all RLS-scoped: admin sees all firm docs, employees only
// assigned clients).
export function DocumentsView({ role }: { role: string }) {
  if (role === "client") return <ClientDocumentsView />;
  return <StaffDocumentsView role={role === "admin" ? "admin" : "employee"} />;
}

function reviewLabel(status: string): string {
  if (status === "received") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "waived") return "Waived";
  return "Pending Review";
}

function reviewTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "received") return "success";
  if (status === "rejected") return "danger";
  if (status === "waived") return "warning";
  return "neutral";
}

async function downloadStoragePath(documentId: string, path: string | null, fileName: string, fallbackUrl: string) {
  const sb = createClient();
  if (sb && path) {
    try {
      await sb.rpc("log_document_download", { p_document: documentId }).then(() => {}, () => {});
      const { data, error } = await sb.storage.from("documents").download(path);
      if (!error && data) {
        const url = URL.createObjectURL(data);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return;
      }
    } catch { /* fall through */ }
  }
  window.open(fallbackUrl, "_blank", "noopener");
}

function StaffVersionHistory({ documentId, currentVersionNo }: { documentId: string; currentVersionNo: number }) {
  const { data: versions, isLoading } = useDocumentVersions(documentId);
  if (isLoading) return <p className="py-2 text-xs" style={{ color: "var(--text-2)" }}>Loading version history…</p>;
  if (!versions || versions.length === 0)
    return <p className="py-2 text-xs" style={{ color: "var(--text-2)" }}>v{currentVersionNo} · current version only — full history appears once migration 0007 is applied.</p>;
  return (
    <div className="space-y-1.5">
      {versions.map((v) => {
        const isCurrent = v.version_no === currentVersionNo;
        return (
          <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-xs" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <Badge tone={isCurrent ? "success" : "neutral"}>v{v.version_no}{isCurrent ? " · current" : ""}</Badge>
            <span className="min-w-0 flex-1 truncate font-medium">{v.file_name}</span>
            <span style={{ color: "var(--text-2)" }}>{(v.created_at ?? "").slice(0, 10)}</span>
            <button className="font-bold text-[#2563EB] hover:underline"
              onClick={() => downloadStoragePath(documentId, v.storage_path ?? (!/^https?:\/\//.test(v.file_url) ? v.file_url : null), v.file_name, v.file_url)}>
              Download
            </button>
          </div>
        );
      })}
    </div>
  );
}

function StaffDocumentsView({ role }: { role: "admin" | "employee" }) {
  const { data: docs = [], mutate, isLoading } = useDocuments();
  const { data: clients = [] } = useClients();
  const { data: filings = [] } = useFilings();
  const { data: jurisdictions = [] } = useJurisdictions();
  const { data: users = [] } = useUsers();
  const { data: reviewItems = [], mutate: mutateReviews } = useReviewItems();
  const { data: inbox = [], mutate: mutateInbox } = useStaffInbox();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newOnly, setNewOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const rows = docs as DocRow[];
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const filingById = useMemo(() => new Map(filings.map((f) => [f.id, f])), [filings]);
  const jurisdictionById = useMemo(() => new Map(jurisdictions.map((j) => [j.id, j])), [jurisdictions]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const itemByDocId = useMemo(() => {
    const m = new Map<string, ChecklistItem>();
    for (const it of reviewItems) if (it.document_id) m.set(it.document_id, it);
    return m;
  }, [reviewItems]);
  const newIds = useMemo(() => new Set((inbox as DocRow[]).map((d) => d.id)), [inbox]);

  const enriched = useMemo(() => rows.map((d) => {
    const client = clientById.get(d.client_id);
    const filing = d.filing_id ? filingById.get(d.filing_id) : undefined;
    const jurisdiction = filing && (filing as unknown as { jurisdiction_id?: string | null }).jurisdiction_id
      ? jurisdictionById.get((filing as unknown as { jurisdiction_id: string }).jurisdiction_id)
      : undefined;
    const item = itemByDocId.get(d.id);
    const status = item ? String(item.status) : "pending";
    const uploader = d.uploaded_by ? userById.get(d.uploaded_by)?.name : undefined;
    return {
      d, client, filing, jurisdiction, item, status,
      clientName: client?.business_name ?? client?.name ?? "—",
      country: jurisdiction?.name ?? "—",
      taxLabel: (filing as { tax_type?: string } | undefined)?.tax_type ?? "—",
      period: (filing as { period?: string } | undefined)?.period ?? "—",
      uploader: uploader ?? ((d as { uploaded_by_role?: string | null }).uploaded_by_role
        ? `Client (${(d as { uploaded_by_role?: string }).uploaded_by_role})` : "—"),
      versionNo: d.version_no ?? 1,
      isNew: newIds.has(d.id),
    };
  }), [rows, clientById, filingById, jurisdictionById, itemByDocId, userById, newIds]);

  const counts = useMemo(() => ({
    total: enriched.length,
    fresh: enriched.filter((r) => r.isNew).length,
    pending: enriched.filter((r) => ["pending", "uploaded"].includes(r.status)).length,
    rejected: enriched.filter((r) => r.status === "rejected").length,
  }), [enriched]);

  const filtered = enriched.filter((r) => {
    if (newOnly && !r.isNew) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${r.d.file_name} ${r.clientName} ${r.country} ${r.taxLabel} ${r.period}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const openRow = openId ? enriched.find((r) => r.d.id === openId) ?? null : null;

  async function openDetail(docId: string) {
    setOpenId(docId);
    setRejecting(false);
    setRejectReason("");
    setError("");
    const sb = createClient();
    if (!sb) return;
    // Clear the "New" flag + audit the view (single flag => no duplicate notifications).
    try { await sb.rpc("mark_document_seen", { p_document: docId }); } catch { /* pre-0004 DBs */ }
    mutateInbox();
  }

  async function review(action: "received" | "rejected" | "pending") {
    if (!openRow?.item) return;
    if (action === "rejected" && !rejectReason.trim()) {
      setError("A reason is required when rejecting — it will be shown to the client.");
      return;
    }
    const sb = createClient();
    if (!sb) { setError("Connect Supabase to review (demo mode is read-only)."); return; }
    setReviewBusy(true);
    setError("");
    try {
      const { error: rpcErr } = await sb.rpc("review_checklist_item", {
        p_item: openRow.item.id,
        p_action: action,
        p_reason: action === "rejected" ? rejectReason.trim() : null,
      });
      if (rpcErr) throw rpcErr;
      setNotice(action === "received" ? "✓ Document accepted." : action === "rejected" ? "Document rejected with reason." : "Moved back to pending review.");
      setTimeout(() => setNotice(""), 4000);
      setRejecting(false);
      setRejectReason("");
      await Promise.all([mutateReviews(), mutate(), mutateInbox()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review action failed.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const sb = createClient();
      if (!sb) return;
      const path = `${Date.now()}-${file.name}`;
      const { error: upErr } = await sb.storage.from("documents").upload(path, file);
      if (upErr) throw upErr;
      const { data: url } = sb.storage.from("documents").getPublicUrl(path);
      await sb.from("documents").insert([{ file_name: file.name, file_url: url.publicUrl, shared_with_client: true, client_id: null }]);
      mutate();
    } finally { setUploading(false); }
  }

  async function bulkZip() {
    const sb = createClient();
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const picked = filtered.length ? filtered.slice(0, 25) : [];
    if (sb) {
      for (const r of picked) {
        const path = r.d.storage_path ?? (!/^https?:\/\//.test(r.d.file_url) ? r.d.file_url : null);
        try {
          if (path) {
            const { data } = await sb.storage.from("documents").download(path);
            if (data) { zip.file(r.d.file_name, data); continue; }
          }
          zip.file(r.d.file_name + ".txt", `Could not fetch ${r.d.file_name}`);
        } catch { zip.file(r.d.file_name + ".txt", `Could not fetch ${r.d.file_name}`); }
      }
    }
    zip.file("manifest.txt", picked.map((r) => `${r.clientName} | ${r.country} | ${r.taxLabel} | ${r.d.file_name} | v${r.versionNo}`).join("\n") || "No files");
    const blob = await zip.generateAsync({ type: "blob" });
    downloadFile("documents.zip", blob);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>{role === "admin" ? "All client documents — review workspace" : "Documents for your assigned clients"}</p></div>
        <div className="ml-auto flex gap-2">
          <label className="btn-primary cursor-pointer px-4 py-2.5 text-sm">{uploading ? "Uploading…" : "Upload docs"}<input type="file" className="hidden" onChange={upload} /></label>
          <Button variant="ghost" onClick={bulkZip}><Download size={15} /> Bulk ZIP</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone="accent">{counts.total} total</Badge>
        <Badge tone="warning">{counts.fresh} new</Badge>
        <Badge tone="neutral">{counts.pending} pending review</Badge>
        {counts.rejected > 0 && <Badge tone="danger">{counts.rejected} rejected</Badge>}
      </div>
      {notice && <p className="rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}>{notice}</p>}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client, file, country, tax…"
            className="rounded-[10px] border px-3 py-1.5 text-xs outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <div className="flex flex-wrap gap-1.5">
            {[["all", "All"], ["pending", "Pending"], ["uploaded", "Uploaded"], ["received", "Accepted"], ["rejected", "Rejected"]].map(([v, label]) => (
              <button key={v} onClick={() => setStatusFilter(v)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusFilter === v ? "text-white" : ""}`}
                style={statusFilter === v ? { background: "#2563EB" } : { border: "1px solid var(--border)" }}>{label}</button>
            ))}
          </div>
          <button onClick={() => setNewOnly((v) => !v)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${newOnly ? "text-white" : ""}`}
            style={newOnly ? { background: "#D97706" } : { border: "1px solid var(--border)" }} title="Show only newly uploaded documents">
            New only{counts.fresh > 0 ? ` (${counts.fresh})` : ""}
          </button>
        </div>
        {isLoading ? <div className="skeleton h-40" /> : filtered.length === 0 ? (
          <EmptyState icon={<FolderOpen size={22} />} title={rows.length === 0 ? (role === "admin" ? "No documents yet" : "No documents for your assigned clients yet") : "No documents match these filters"} />
        ) : (
          <DataTable columns={["Client", "Country / Tax", "Document", "Uploaded", "Review", "Actions"]} rows={filtered.map((r) => [
            <span key="c"><span className="font-semibold">{r.clientName}</span><br /><span className="text-xs" style={{ color: "var(--text-2)" }}>by {r.uploader}</span></span>,
            <span key="t">{r.country}<br /><span className="text-xs" style={{ color: "var(--text-2)" }}>{r.taxLabel} · {r.period}</span></span>,
            <span key="d" className="flex items-center gap-1.5"><span className="min-w-0 max-w-[180px] truncate font-semibold">{r.d.file_name}</span>
              <Badge tone="neutral">v{r.versionNo}</Badge>
              {r.versionNo > 1 && <Badge tone="accent">Re-uploaded</Badge>}
              {r.isNew && <Badge tone="warning">New</Badge>}</span>,
            <span key="u" className="text-xs">{(r.d.created_at ?? "").slice(0, 10)}</span>,
            <span key="s"><Badge tone={reviewTone(r.status)}>{reviewLabel(r.status)}</Badge></span>,
            <span key="a"><button onClick={() => openDetail(r.d.id)} className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-xs font-bold"><Eye size={12} /> Open</button></span>,
          ])} />
        )}
      </Card>
      <Modal open={openRow !== null} onClose={() => setOpenId(null)} title={openRow ? openRow.d.file_name : "Document"}>
        {openRow && (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p><span style={{ color: "var(--text-2)" }}>Client: </span><span className="font-semibold">{openRow.clientName}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Country: </span><span className="font-semibold">{openRow.country}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Tax: </span><span className="font-semibold">{openRow.taxLabel} · {openRow.period}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Version: </span><span className="font-semibold">v{openRow.versionNo}{openRow.versionNo > 1 ? " (Re-uploaded)" : ""}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Uploaded by: </span><span className="font-semibold">{openRow.uploader}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Uploaded: </span><span className="font-semibold">{(openRow.d.created_at ?? "").slice(0, 16).replace("T", " ")}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={reviewTone(openRow.status)}>{reviewLabel(openRow.status)}</Badge>
              {openRow.isNew && <Badge tone="warning">New for review</Badge>}
              <Button variant="ghost" className="ml-auto px-3 py-1.5 text-xs"
                onClick={() => downloadStoragePath(openRow.d.id, openRow.d.storage_path ?? (!/^https?:\/\//.test(openRow.d.file_url) ? openRow.d.file_url : null), openRow.d.file_name, openRow.d.file_url)}>
                <Download size={13} /> Download latest
              </Button>
            </div>
            {openRow.item?.rejection_reason && openRow.status === "rejected" && (
              <p className="rounded-xl px-3 py-2 text-xs font-medium" style={{ background: "var(--danger-bg)", color: "var(--danger-tx)" }}>
                Rejection reason (visible to client): {openRow.item.rejection_reason}
              </p>
            )}
            <div>
              <p className="eyebrow mb-2">Version history</p>
              <StaffVersionHistory documentId={openRow.d.id} currentVersionNo={openRow.versionNo} />
            </div>
            <div>
              <p className="eyebrow mb-2">Review</p>
              {openRow.item ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button className="px-4 py-2 text-xs" disabled={reviewBusy} onClick={() => review("received")}><Check size={13} /> Accept</Button>
                    <Button variant="ghost" className="px-4 py-2 text-xs" disabled={reviewBusy} onClick={() => setRejecting((v) => !v)}><X size={13} /> Reject</Button>
                    {(openRow.status === "received" || openRow.status === "rejected") && (
                      <Button variant="ghost" className="px-4 py-2 text-xs" disabled={reviewBusy} onClick={() => review("pending")}><History size={13} /> Back to pending</Button>
                    )}
                  </div>
                  {rejecting && (
                    <div className="space-y-2">
                      <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason (required — shown to the client)…"
                        rows={3} className="w-full rounded-[10px] border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
                      <Button variant="danger" className="px-4 py-2 text-xs" disabled={reviewBusy || !rejectReason.trim()} onClick={() => review("rejected")}>
                        {reviewBusy ? "Rejecting…" : "Confirm rejection"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs" style={{ color: "var(--text-2)" }}>No checklist review item is linked to this upload yet — review actions appear once it is attached to a filing checklist.</p>
              )}
              {error && <p className="mt-2 text-xs font-medium" style={{ color: "#DC2626" }}>✕ {error}</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- Messages ----------
export function MessagesView() {
  const [threads] = useState([{ id: "1", name: "Apex support", preview: "Your VAT filing is ready for review", unread: 2 }]);
  const [active, setActive] = useState("1");
  const [msgs, setMsgs] = useState([{ from: "them", body: "Hi! Your VAT Q3 draft is ready — please review and sign." }, { from: "me", body: "Thanks, reviewing today." }]);
  const [draft, setDraft] = useState("");

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setMsgs([...msgs, { from: "me", body: draft }]);
    setDraft("");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Messages</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-2">
          {threads.map((t) => (
            <button key={t.id} onClick={() => setActive(t.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${active === t.id ? "text-white" : ""}`} style={active === t.id ? { background: "#2563EB" } : undefined}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full font-bold" style={{ background: active === t.id ? "rgba(255,255,255,.25)" : "var(--accent-tint)", color: active === t.id ? "#fff" : "var(--accent)" }}>{t.name[0]}</span>
              <span><span className="block text-sm font-semibold">{t.name}</span><span className="block text-xs opacity-70">{t.preview}</span></span>
              {t.unread > 0 && <Badge tone={active === t.id ? "neutral" : "accent"}>{t.unread}</Badge>}
            </button>
          ))}
        </Card>
        <Card className="flex min-h-[400px] flex-col md:col-span-2">
          <div className="flex-1 space-y-2">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${m.from === "me" ? "ml-auto text-white" : ""}`} style={m.from === "me" ? { background: "#2563EB" } : { background: "var(--bg)", border: "1px solid var(--border)" }}>{m.body}</div>
            ))}
          </div>
          <form onSubmit={send} className="mt-4 flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" className="flex-1 rounded-[10px] border px-3 py-2.5 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <Button><Send size={15} /> Send</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

// ---------- Payments ----------
export function PaymentsView({ role }: { role: string }) {
  const { data = [], isLoading } = usePayments();
  const outstanding = data.filter((p) => p.status !== "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Payments</h1>
      {outstanding > 0 && <div className="rounded-2xl px-5 py-4 text-sm font-semibold" style={{ background: "var(--warn-bg)", color: "var(--warn-tx)" }}>Outstanding balance: {formatMoney(outstanding)}</div>}
      <Card>
        {isLoading ? <div className="skeleton h-32" /> : data.length === 0 ? (
          <EmptyState icon={<CreditCard size={22} />} title="No invoices yet — new invoices from your firm will appear here" />
        ) : (
          <DataTable columns={["Invoice", "Amount", "Due", "Status"]} rows={data.map((p) => [
            <span key="i" className="tnum font-mono text-[13px]">{p.invoice_number}</span>,
            <span key="a" className="tnum font-semibold">{formatMoney(Number(p.amount))}</span>,
            <span key="d">{p.due_date}</span>,
            <span key="s"><StatusBadge status={p.status} /></span>,
          ])} />
        )}
      </Card>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => downloadFile("invoices.csv", toCSV(data as unknown as Record<string, unknown>[]))}>Export CSV</Button>
        <Button variant="ghost" onClick={() => exportPDF("Revenue report", data as unknown as Record<string, unknown>[])}>Export PDF</Button>
      </div>
    </div>
  );
}

export function SimplePage({ title, sub, ctaHref, ctaLabel }: { title: string; sub: string; ctaHref?: string; ctaLabel?: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <Card><EmptyState icon={<FileText size={22} />} title={sub} action={ctaHref ? <a href={ctaHref} className="btn-primary px-4 py-2 text-sm">{ctaLabel ?? "Open"}</a> : undefined} /></Card>
    </div>
  );
}
