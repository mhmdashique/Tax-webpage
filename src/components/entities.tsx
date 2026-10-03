"use client";
import { useMemo, useState } from "react";
import { Card, EmptyState, StatusBadge, Badge, Button, Modal, DataTable } from "./ui";
import { useClients, useFilings, useTasks, usePayments, useDocuments, useJurisdictions, useUsers, useReviewItems, useStaffInbox, useDocumentVersions } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { dueLabel, toCSV, downloadFile, exportPDF, formatMoney } from "@/lib/data";
import { FILING_STAGES, normalizeStage, displayStatus, nextStage, canAdvance, stageLabel, isOverdue } from "@/lib/lifecycle";
import { Users, FileText, FolderOpen, CreditCard, Plus, Trash2, Send, Download, Eye, Check, X, History } from "lucide-react";
import { ClientDocumentsView } from "./smart-documents-client";
import { GstPaymentsPanel, useGstPayments } from "./gst-payments";
import { AddTaskButton, TaskCenter } from "./task-center";
import { SearchSelect } from "./search-select";
import { clientProgress } from "./task-center";
import type { Client, Filing, DocRow, ChecklistItem, Task } from "@/types/database";

/** Tasks tab inside the client profile modal. */
function ClientProfileTasks({ tasks }: { tasks: Task[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter((t) => !["done", "cancelled"].includes(String(t.status)));
  const done = tasks.filter((t) => ["done", "cancelled"].includes(String(t.status)));
  const row = (t: Task) => {
    const p = clientProgress(t, today);
    return (
      <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
        <span className="min-w-0 flex-1 truncate font-semibold">{t.title}</span>
        {t.task_for === "client" && <Badge tone={p.tone}>{p.label}</Badge>}
        <Badge>{String(t.status).replace(/_/g, " ")}</Badge>
        <span className="text-xs" style={{ color: "var(--text-2)" }}>{t.due_date ?? "No due date"}</span>
      </div>
    );
  };
  return (
    <div className="space-y-3">
      <div>
        <p className="eyebrow mb-2">Open ({open.length})</p>
        <div className="space-y-2">{open.length === 0 ? <p className="text-xs" style={{ color: "var(--text-2)" }}>No open tasks.</p> : open.map(row)}</div>
      </div>
      <div>
        <p className="eyebrow mb-2">Done / cancelled ({done.length})</p>
        <div className="space-y-2">{done.length === 0 ? <p className="text-xs" style={{ color: "var(--text-2)" }}>Nothing closed yet.</p> : done.map(row)}</div>
      </div>
    </div>
  );
}

function useRoleScope(role: string) {
  return { readOnly: false, role };
}

const PAYMENT_STATUS_FILTERS = ["payment_due", "partly_paid", "payment_overdue", "paid", "not_required"];

// ---------- Clients ----------
export function ClientsView({ role }: { role: "admin" | "employee" }) {
  const { data = [], mutate, isLoading } = useClients();
  const { data: tasks = [] } = useTasks();
  const { data: users = [], error: usersError } = useUsers();
  const employees = useMemo(() => users.filter((u) => u.role === "employee"), [users]);
  const ownerName = (id?: string | null) => employees.find((e) => e.id === id)?.name ?? (id ? "Assigned employee" : "Unassigned");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", business_name: "", entity_type: "LLC", tax_id: "" });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [profileTab, setProfileTab] = useState<"details" | "tasks">("details");
  const [assignError, setAssignError] = useState("");
  const [assigning, setAssigning] = useState(false);

  async function assignEmployee(clientId: string, employeeId: string) {
    const sb = createClient();
    if (!sb) { setAssignError("Connect Supabase before assigning."); return; }
    setAssigning(true);
    setAssignError("");
    const { error } = await sb.from("clients").update({ assigned_employee_id: employeeId || null }).eq("id", clientId);
    setAssigning(false);
    if (error) { setAssignError(error.message); return; }
    const updated = await mutate();
    const fresh = (updated as Client[] | undefined)?.find((c) => c.id === clientId) ?? null;
    if (fresh) setSelectedClient(fresh);
    else setSelectedClient((prev) => (prev && prev.id === clientId ? { ...prev, assigned_employee_id: employeeId || null } : prev));
  }

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
          <DataTable columns={["Client", "Business", "Entity", "Status", "Owner", "Actions"]} onRowClick={(idx) => setSelectedClient(data[idx])} rows={data.map((c, idx) => [
            <span key="n"><span className="font-semibold">{c.name}</span><br /><span className="text-xs" style={{ color: "var(--text-2)" }}>{c.email}</span></span>,
            <span key="b">{c.business_name ?? "—"}</span>,
            <span key="e">{c.entity_type ?? "—"}</span>,
            <span key="s"><StatusBadge status={c.status} /></span>,
            <span key="o" className="text-xs">{c.assigned_employee_id ? ownerName(c.assigned_employee_id) : <span className="font-semibold text-[#B45309]">Unassigned</span>}</span>,
            <span key="a" className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <AddTaskButton role={role} client={c} label="Add task" />
              {confirm === c.id ? (
                <span className="flex gap-2"><button className="text-xs font-bold text-[#DC2626]" onClick={() => remove(c.id)}>Confirm delete</button><button className="text-xs" onClick={() => setConfirm(null)}>Cancel</button></span>
              ) : <button className="btn-ghost px-2 py-1" onClick={() => setConfirm(c.id)} aria-label="Delete"><Trash2 size={14} /></button>}
            </span>,
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

      <Modal open={!!selectedClient} onClose={() => { setSelectedClient(null); setProfileTab("details"); }} title="Client Details" size="xl">
        {selectedClient && (
          <div className="space-y-4 text-sm">
            <div className="flex gap-2">
              {(["details", "tasks"] as const).map((t) => (
                <button key={t} onClick={() => setProfileTab(t)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize ${profileTab === t ? "text-white" : ""}`}
                  style={profileTab === t ? { background: "#2563EB" } : { border: "1px solid var(--border)" }}>
                  {t === "details" ? "Details" : `Tasks (${tasks.filter((t) => t.related_client_id === selectedClient.id).length})`}
                </button>
              ))}
            </div>
            {profileTab === "details" ? (
              <div className="space-y-3">
                <p><strong>Name:</strong> {selectedClient.name}</p>
                <p><strong>Email:</strong> {selectedClient.email}</p>
                <p><strong>Business Name:</strong> {selectedClient.business_name ?? "N/A"}</p>
                <p><strong>Entity Type:</strong> {selectedClient.entity_type ?? "N/A"}</p>
                <p><strong>Tax ID:</strong> {selectedClient.tax_id ?? "N/A"}</p>
                <p><strong>Status:</strong> {selectedClient.status}</p>
                <p><strong>Assigned employee:</strong> {ownerName(selectedClient.assigned_employee_id)}</p>
                {role === "admin" && (
                  <div className="max-w-sm">
                    <SearchSelect
                      label="Assigned employee"
                      value={selectedClient.assigned_employee_id ?? ""}
                      onChange={(id) => void assignEmployee(selectedClient.id, id)}
                      options={employees.map((e) => ({ id: e.id, label: e.name }))}
                      placeholder="Search employees"
                      disabled={assigning}
                      error={usersError ? `Could not load employees: ${usersError.message}` : assignError || undefined}
                      emptyText="No employees found."
                    />
                    <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>
                      Only the assigned employee (and admins) can create tasks for this client. Clear to unassign.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <ClientProfileTasks tasks={tasks.filter((t) => t.related_client_id === selectedClient.id)} />
            )}
            <div className="flex flex-wrap gap-2">
              <AddTaskButton role={role} client={selectedClient} />
              <Button variant="ghost" onClick={() => { setSelectedClient(null); setProfileTab("details"); }}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- Filings (7-stage lifecycle) ----------
export function FilingsView({ role }: { role: "admin" | "employee" | "client" }) {
  const { data = [], mutate, isLoading } = useFilings();
  const { data: clients = [] } = useClients();
  const { data: gstPayments = [], mutate: mutateGstPayments } = useGstPayments();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({
    tax_type: "GSTR-3B",
    period: "",
    due_date: "",
    client_id: "",
    amount_owed: "0",
    output_gst: "0",
    eligible_itc: "0",
    wrongly_utilized_itc: "0",
    output_gst_cgst: "",
    output_gst_sgst: "",
    output_gst_igst: "",
    eligible_itc_cgst: "",
    eligible_itc_sgst: "",
    eligible_itc_igst: "",
    tax_payable_cgst: "",
    tax_payable_sgst: "",
    tax_payable_igst: "",
    turnover: "",
    is_nil_return: false,
    gst_tax_mode: "cgst_sgst",
  });
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [selectedFiling, setSelectedFiling] = useState<Filing | null>(null);
  const [filingModalTab, setFilingModalTab] = useState<"details" | "tasks">("details");
  const [error, setError] = useState("");

  const gstPaymentByFiling = useMemo(() =>
    new Map(gstPayments.map((payment) => [payment.filing_id, payment])),
  [gstPayments]);
  const filters = ["all", "created", "documents_requested", "documents_received", "in_preparation", "client_review", "filed", "completed", "overdue", ...PAYMENT_STATUS_FILTERS];

  const filtered = useMemo(() => {
    if (filter === "all") return data;
    if (PAYMENT_STATUS_FILTERS.includes(filter)) {
      const paymentStatus = filter === "payment_overdue" ? "overdue" : filter;
      return data.filter((f) => gstPaymentByFiling.get(f.id)?.summary.status === paymentStatus);
    }
    return data.filter((f) => normalizeStage(String(f.status)).includes(filter) || displayStatus(String(f.status), f.due_date) === filter);
  }, [data, filter, gstPaymentByFiling]);
  const isGst = form.tax_type.toLowerCase().includes("gst");
  const selectedClient = clients.find((client) => client.id === form.client_id);
  const filterLabel = (value: string) => value === "payment_overdue" ? "payment overdue" : value.replace(/_/g, " ");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const sb = createClient();
    if (!sb) { setError("Connect Supabase to create a filing."); return; }
    if (!form.client_id) { setError("Choose a client for this filing."); return; }
    if (isGst && !form.is_nil_return && form.turnover === "" && selectedClient?.annual_turnover_previous_fy == null) {
      setError("Enter the client's previous financial year's aggregate turnover before creating a GST return.");
      return;
    }
    if (isGst) {
      const outputComponents = Number(form.output_gst_cgst || 0) + Number(form.output_gst_sgst || 0) + Number(form.output_gst_igst || 0);
      const itcComponents = Number(form.eligible_itc_cgst || 0) + Number(form.eligible_itc_sgst || 0) + Number(form.eligible_itc_igst || 0);
      const cashTax = Number(form.output_gst) === 0 && Number(form.eligible_itc) === 0
        ? Number(form.amount_owed)
        : Math.max(0, Number(form.output_gst) - Number(form.eligible_itc));
      const payableComponents = Number(form.tax_payable_cgst || 0) + Number(form.tax_payable_sgst || 0) + Number(form.tax_payable_igst || 0);
      const cents = (amount: number) => Math.round(amount * 100);
      if (cents(outputComponents) !== cents(Number(form.output_gst))
        || cents(itcComponents) !== cents(Number(form.eligible_itc))
        || cents(payableComponents) !== cents(cashTax)) {
        setError("GST component amounts must match output GST, eligible ITC, and net cash payable totals.");
        return;
      }
    }
    setError("");
    if (form.turnover !== "") {
      const { error: turnoverError } = await sb.rpc("set_gst_client_turnover", {
        p_client_id: form.client_id,
        p_turnover: Number(form.turnover),
      });
      if (turnoverError) { setError(turnoverError.message); return; }
    }
    // Stage 1 Created — auto-creates task + client upload action item downstream
    const { error: insertError } = await sb.from("filings").insert([{
      tax_type: form.tax_type,
      period: form.period,
      due_date: form.due_date,
      status: "created",
      amount_owed: Number(form.amount_owed),
      client_id: form.client_id,
      ...(isGst ? {
        output_gst: Number(form.output_gst),
        eligible_itc: Number(form.eligible_itc),
        wrongly_utilized_itc: Number(form.wrongly_utilized_itc),
        output_gst_cgst: Number(form.output_gst_cgst || 0),
        output_gst_sgst: Number(form.output_gst_sgst || 0),
        output_gst_igst: Number(form.output_gst_igst || 0),
        eligible_itc_cgst: Number(form.eligible_itc_cgst || 0),
        eligible_itc_sgst: Number(form.eligible_itc_sgst || 0),
        eligible_itc_igst: Number(form.eligible_itc_igst || 0),
        tax_payable_cgst: Number(form.tax_payable_cgst || 0),
        tax_payable_sgst: Number(form.tax_payable_sgst || 0),
        tax_payable_igst: Number(form.tax_payable_igst || 0),
        is_nil_return: form.is_nil_return,
        gst_tax_mode: form.gst_tax_mode,
      } : {}),
    }]);
    if (insertError) setError(insertError.message);
    else { setOpen(false); mutate(); }
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
      const { error: updateError } = await sb.from("filings").update(payload).eq("id", filing.id);
      if (updateError) throw updateError;
      // Stage side-effects, mirrored server-side when Supabase is live:
      // documents_requested → client "upload documents" action item
      // in_preparation → record amount owed/refund
      // client_review → client "review and sign" action item, signature stored on sign
      // filed → fee invoice generated; completed → receipt downloadable
      await sb.from("activity_log").insert([{ action: `moved filing to ${nxt}`, entity_type: "filing", entity_id: filing.id }]);
      await mutate();
      if (nxt === "filed") await mutateGstPayments();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update filing status.");
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
      {error && <p role="alert" className="rounded-lg px-3 py-2 text-sm text-[#DC2626]" style={{ background: "var(--surface)" }}>{error}</p>}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === f ? "text-white" : ""}`}
            style={filter === f ? { background: "#2563EB" } : { background: "var(--surface)", border: "1px solid var(--border)" }}>{filterLabel(f)}</button>
        ))}
      </div>
      <Card>
        {isLoading ? <div className="skeleton h-40" /> : filtered.length === 0 ? (
          <EmptyState icon={<FileText size={22} />} title="No filings found — create one to start tracking deadlines" action={role !== "client" ? <Button onClick={() => setOpen(true)}>New filing</Button> : undefined} />
        ) : (
          <DataTable columns={["Filing", "Period", "Due", "Status", "Payment", "Owed", "Next"]} onRowClick={(idx) => setSelectedFiling(filtered[idx])} rows={filtered.map((f, idx) => {
            const eff = displayStatus(String(f.status), f.due_date);
            const nxt = nextStage(String(f.status));
            const payment = gstPaymentByFiling.get(f.id);
            const paymentPending = nxt === "completed" && (
              payment
                ? !["paid", "not_required"].includes(payment.summary.status)
                : f.tax_type.toLowerCase().includes("gst")
            );
            return [
            <span key="f" className="font-semibold">{f.tax_type}</span>,
            <span key="p">{f.period}</span>,
            <span key="d"><Badge tone={isOverdue(String(f.status), f.due_date) ? "danger" : "warning"}>{dueLabel(f.due_date)}</Badge></span>,
            <span key="s" title={FILING_STAGES.find((s) => s.key === normalizeStage(String(f.status)))?.desc}><StatusBadge status={stageLabel(String(f.status), role === "client")} /></span>,
            <span key="pay">{payment ? <span className="inline-flex flex-col items-start gap-1"><Badge tone={payment.summary.status === "overdue" ? "danger" : payment.summary.status === "paid" ? "success" : "warning"}>{payment.summary.status.replace(/_/g, " ")}</Badge><span className="text-xs tnum">{payment.summary.status === "not_required" && Number(payment.summary.credit_carry_forward) > 0 ? `Credit carried forward ${formatMoney(Number(payment.summary.credit_carry_forward))}` : formatMoney(Number(payment.summary.balance))}</span></span> : "—"}</span>,
            <span key="o" className="tnum">{formatMoney(Number(f.amount_owed ?? 0))}</span>,
            <span key="n" className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              {nxt && canAdvance(role, String(f.status)) && eff !== "overdue" && !paymentPending ? (
                <button disabled={advancing === f.id} onClick={() => advance(f)} className="rounded-lg px-2 py-1 text-xs font-bold text-white disabled:opacity-50" style={{ background: "#2563EB" }} title={FILING_STAGES.find((s) => s.key === nxt)?.desc}>
                  {advancing === f.id ? "…" : `→ ${stageLabel(nxt, role === "client")}`}
                </button>
              ) : paymentPending ? <span className="text-xs text-[#D97706]" title="Payment must be cleared before completion">{payment ? `Payment pending: ${formatMoney(Number(payment.summary.balance))}` : "GST payment calculation pending"}</span>
              : eff === "overdue" ? <Badge tone="danger">Overdue</Badge> : <span className="text-xs" style={{ color: "var(--text-2)" }}>—</span>}
              {role === "employee" && eff !== "overdue" && <button onClick={() => escalate(f.id)} className="rounded-lg border px-2 py-1 text-xs font-semibold" style={{ borderColor: "var(--border)" }} title="Flag at-risk to admin">Escalate</button>}
            </span>,
            ];
          })} />
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="New Filing">
        <form onSubmit={create} className="space-y-3">
          <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value, turnover: String(clients.find((client) => client.id === e.target.value)?.annual_turnover_previous_fy ?? "") })} className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} required>
            <option value="">Choose client</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.business_name ?? client.name}</option>)}
          </select>
          <select value={form.tax_type} onChange={(e) => setForm({ ...form, tax_type: e.target.value, is_nil_return: e.target.value === "GST Nil Return" })} className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            {["GSTR-3B", "GSTR-1", "GST Nil Return", "Corporate Tax", "Payroll", "Income Tax", "Sales Tax"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input placeholder="Period (e.g. 2026-09)" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          {isGst && <>
            <label className="block text-xs font-semibold">Previous financial year&apos;s aggregate turnover (₹)</label>
            <input type="number" min="0" step="0.01" value={form.turnover} onChange={(e) => setForm({ ...form, turnover: e.target.value })}
              placeholder={selectedClient?.annual_turnover_previous_fy == null ? "Required for a late non-nil return" : "Update if needed"}
              className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input aria-label="Output GST" type="number" min="0" step="0.01" value={form.output_gst} onChange={(e) => setForm({ ...form, output_gst: e.target.value })} placeholder="Output GST (₹)" className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input aria-label="Eligible ITC" type="number" min="0" step="0.01" value={form.eligible_itc} onChange={(e) => setForm({ ...form, eligible_itc: e.target.value })} placeholder="Eligible ITC (₹)" className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input aria-label="Wrongly utilized ITC" type="number" min="0" step="0.01" value={form.wrongly_utilized_itc} onChange={(e) => setForm({ ...form, wrongly_utilized_itc: e.target.value })} placeholder="Potentially wrongly utilized ITC (₹)" className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <p className="text-xs font-semibold">GST return component totals (₹)</p>
            {([
              ["output_gst_cgst", "Output CGST"], ["output_gst_sgst", "Output SGST"], ["output_gst_igst", "Output IGST"],
              ["eligible_itc_cgst", "Eligible CGST ITC"], ["eligible_itc_sgst", "Eligible SGST ITC"], ["eligible_itc_igst", "Eligible IGST ITC"],
              ["tax_payable_cgst", "Net CGST payable"], ["tax_payable_sgst", "Net SGST payable"], ["tax_payable_igst", "Net IGST payable"],
            ] as const).map(([field, label]) => (
              <input key={field} aria-label={label} type="number" min="0" step="0.01" value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                placeholder={`${label} (₹)`} className="w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            ))}
            <p className="text-xs" style={{ color: "var(--text-2)" }}>Enter net component payable after applying the GST return&apos;s eligible ITC set-off; each component sum must match its aggregate.</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_nil_return} onChange={(e) => setForm({ ...form, is_nil_return: e.target.checked })} /> This is a nil return</label>
          </>}
          <Button className="w-full">Create filing</Button>
        </form>
      </Modal>

      <Modal open={!!selectedFiling} onClose={() => { setSelectedFiling(null); setFilingModalTab("details"); }} title="Filing overview" size="xl">
        {selectedFiling && (
          <div className="space-y-5">
            <div className="flex gap-2 border-b pb-3" style={{ borderColor: "var(--border)" }}>
              {(["details", "tasks"] as const).map((tab) => <button key={tab} onClick={() => setFilingModalTab(tab)}
                className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${filingModalTab === tab ? "text-white" : ""}`}
                style={filingModalTab === tab ? { background: "#2563EB" } : { background: "var(--bg)", border: "1px solid var(--border)" }}>{tab}</button>)}
            </div>
            {filingModalTab === "details" ? <>
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border p-4 sm:p-5" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>
                <FileText size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-2)" }}>Tax filing</p>
                <h4 className="mt-1 truncate text-lg font-bold">{selectedFiling.tax_type}</h4>
                <p className="mt-0.5 text-sm" style={{ color: "var(--text-2)" }}>Tax period · {selectedFiling.period}</p>
              </div>
              <StatusBadge status={stageLabel(String(selectedFiling.status), role === "client")} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Filing period</p>
                <p className="mt-1 font-semibold">{selectedFiling.period || "—"}</p>
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Return due date</p>
                <p className="mt-1 font-semibold">{selectedFiling.due_date || "—"}</p>
              </div>
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Amount owed</p>
                <p className="tnum mt-1 text-lg font-bold">{formatMoney(Number(selectedFiling.amount_owed ?? 0))}</p>
              </div>
              {Number(selectedFiling.amount_refund ?? 0) > 0 && (
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                  <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Expected refund</p>
                  <p className="tnum mt-1 text-lg font-bold">{formatMoney(Number(selectedFiling.amount_refund))}</p>
                </div>
              )}
              {selectedFiling.filed_at && (
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                  <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>Filed on</p>
                  <p className="mt-1 font-semibold">{selectedFiling.filed_at.slice(0, 10)}</p>
                </div>
              )}
            </div>

            {gstPaymentByFiling.has(selectedFiling.id) && (
              <div className="border-t pt-5" style={{ borderColor: "var(--border)" }}>
                <GstPaymentsPanel role={role} filingId={selectedFiling.id} />
              </div>
            )}
            <AddTaskButton role={role} filing={selectedFiling} client={clients.find((client) => client.id === selectedFiling.client_id)} label={role === "client" ? "Raise query" : "Add task"} />
            </> : <FilingTasksPanel role={role} filing={selectedFiling} client={clients.find((client) => client.id === selectedFiling.client_id)} />}
            <div className="flex justify-end border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <Button variant="ghost" onClick={() => { setSelectedFiling(null); setFilingModalTab("details"); }}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------- Tasks (Kanban with drag-drop) ----------
export function TasksView({ role = "admin" }: { role?: "admin" | "employee" }) {
  return <TaskCenter role={role} />;
}

function FilingTasksPanel({ role, filing, client }: { role: "admin" | "employee" | "client"; filing: Filing; client?: Client }) {
  const { data = [], error } = useTasks();
  const tasks = data.filter((task) => task.related_filing_id === filing.id);
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <div><h4 className="font-semibold">Tasks for this filing</h4><p className="text-xs" style={{ color: "var(--text-2)" }}>{tasks.length} linked tasks</p></div>
      <AddTaskButton role={role} filing={filing} client={client} label={role === "client" ? "Raise query" : "Add task"} />
    </div>
    {error && <p role="alert" className="text-sm text-[#DC2626]">Could not load filing tasks: {error.message}</p>}
    {tasks.map((task) => <div key={task.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
      <span className="min-w-0 flex-1 font-medium">{task.title}</span>
      <Badge>{String(task.status).replace(/_/g, " ")}</Badge>
      <span className="text-xs" style={{ color: "var(--text-2)" }}>{task.due_date ? dueLabel(task.due_date) : "No due date"}</span>
    </div>)}
    {!tasks.length && <p className="rounded-xl p-4 text-sm" style={{ background: "var(--bg)", color: "var(--text-2)" }}>No tasks are linked to this filing yet.</p>}
  </div>;
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
      <Modal open={openRow !== null} onClose={() => setOpenId(null)} title={openRow ? openRow.d.file_name : "Document"} size="xl">
        {openRow && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>
                <FileText size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-all text-base font-bold">{openRow.d.file_name}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={reviewTone(openRow.status)}>{reviewLabel(openRow.status)}</Badge>
                  <Badge tone="neutral">v{openRow.versionNo}{openRow.versionNo > 1 ? " · Re-uploaded" : ""}</Badge>
                  {openRow.isNew && <Badge tone="warning">New for review</Badge>}
                </div>
              </div>
              <Button variant="ghost" className="shrink-0 px-4 py-2.5 text-sm"
                onClick={() => downloadStoragePath(openRow.d.id, openRow.d.storage_path ?? (!/^https?:\/\//.test(openRow.d.file_url) ? openRow.d.file_url : null), openRow.d.file_name, openRow.d.file_url)}>
                <Download size={15} /> Download latest
              </Button>
            </div>
            <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <p><span style={{ color: "var(--text-2)" }}>Client: </span><span className="font-semibold">{openRow.clientName}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Country: </span><span className="font-semibold">{openRow.country}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Tax: </span><span className="font-semibold">{openRow.taxLabel} · {openRow.period}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Uploaded by: </span><span className="font-semibold">{openRow.uploader}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Uploaded: </span><span className="font-semibold">{(openRow.d.created_at ?? "").slice(0, 16).replace("T", " ")}</span></p>
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
      <GstPaymentsPanel role={role} />
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
