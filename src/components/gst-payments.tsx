"use client";

import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase/client";
import { SearchSelect } from "@/components/search-select";
import { formatMoney } from "@/lib/data";
import { Badge, Button, Card } from "./ui";

type GstSummary = {
  filing_payment_id: string;
  filing_id: string;
  tax_payable: number;
  output_gst_cgst: number | null;
  output_gst_sgst: number | null;
  output_gst_igst: number | null;
  eligible_itc_cgst: number | null;
  eligible_itc_sgst: number | null;
  eligible_itc_igst: number | null;
  tax_payable_cgst: number | null;
  tax_payable_sgst: number | null;
  tax_payable_igst: number | null;
  component_breakdown_available: boolean;
  wrong_itc_payable: number;
  interest_due: number;
  interest_cgst: number;
  interest_sgst: number;
  interest_igst: number;
  wrong_itc_interest_due: number;
  interest_accrued_lifetime: number;
  late_fee_due: number;
  total_due: number;
  amount_paid: number;
  advance_paid: number;
  balance: number;
  credit_carry_forward: number;
  status: "not_required" | "payment_due" | "partly_paid" | "paid" | "overdue";
  due_date: string;
  turnover_required: boolean;
  rules_confirmed: boolean;
  challan_uploaded: boolean;
  wrong_itc_confirmation_required: boolean;
  daily_interest_accrual: number;
  late_fee_cgst: number;
  late_fee_sgst: number;
  late_fee_igst: number;
  due_within_three_days: boolean;
};

type GstPaymentRow = {
  id: string;
  filing_id: string;
  client_id: string;
  filed_on: string;
  currency: "INR";
  summary: GstSummary;
  transactions: { id: string; amount: number; paid_on: string; method: string; challan_no: string }[];
  proofs: { id: string; proof_path: string; uploaded_at: string; verified_at: string | null }[];
};

type GstNotification = {
  id: string;
  event_type: string;
  message: string;
  scheduled_for: string;
  read_at: string | null;
};

const statuses = ["all", "payment_due", "partly_paid", "paid", "overdue", "not_required"] as const;

async function fetchGstPayments(): Promise<GstPaymentRow[]> {
  const sb = createClient();
  if (!sb) return [];
  const { data: headers, error } = await sb
    .from("filing_payments")
    .select("id, filing_id, client_id, filed_on, currency")
    .order("filed_on", { ascending: false })
    .limit(100);
  if (error) throw error;

  return Promise.all((headers ?? []).map(async (header) => {
    const [summaryResult, transactionsResult, proofsResult] = await Promise.all([
      sb.rpc("gst_payment_summary", { p_payment: header.id }),
      sb.from("filing_payment_transactions").select("id,amount,paid_on,method,challan_no")
        .eq("filing_payment_id", header.id).order("paid_on"),
      sb.from("gst_payment_proofs").select("id,proof_path,uploaded_at,verified_at")
        .eq("filing_payment_id", header.id).order("uploaded_at", { ascending: false }),
    ]);
    if (summaryResult.error) throw summaryResult.error;
    if (transactionsResult.error) throw transactionsResult.error;
    if (proofsResult.error) throw proofsResult.error;
    return {
      ...header,
      summary: summaryResult.data as GstSummary,
      transactions: transactionsResult.data ?? [],
      proofs: proofsResult.data ?? [],
    } as GstPaymentRow;
  }));
}

function paymentTone(status: string): "danger" | "warning" | "success" | "neutral" {
  if (status === "overdue") return "danger";
  if (status === "payment_due" || status === "partly_paid") return "warning";
  if (status === "paid") return "success";
  return "neutral";
}

export function useGstPayments() {
  return useSWR<GstPaymentRow[]>("gst-payment-records", fetchGstPayments);
}

function GstNotificationFeed() {
  const sb = createClient();
  const [message, setMessage] = useState("");
  const { data: notifications = [], error, mutate } = useSWR<GstNotification[]>("gst-payment-notifications", async () => {
    if (!sb) return [];
    const today = new Date().toISOString().slice(0, 10);
    const { data, error: queryError } = await sb.from("gst_payment_notifications")
      .select("id,event_type,message,scheduled_for,read_at")
      .lte("scheduled_for", today)
      .order("scheduled_for", { ascending: false })
      .limit(15);
    if (queryError) throw queryError;
    return (data ?? []) as GstNotification[];
  });
  if (error) return <Card><p className="text-xs text-[#DC2626]">Could not load GST notifications: {error.message}</p></Card>;
  if (notifications.length === 0) return null;
  return <Card>
    <h3 className="mb-2 text-sm font-semibold">GST notifications</h3>
    {message && <p role="alert" className="mb-2 text-xs text-[#DC2626]">{message}</p>}
    <div className="space-y-2">
      {notifications.map((notification) => <div key={notification.id} className="flex items-start gap-3 rounded-lg p-2 text-xs"
        style={{ background: "var(--bg)", opacity: notification.read_at ? 0.7 : 1 }}>
        <div className="min-w-0 flex-1">
          <strong className="block">{notification.event_type.replace(/_/g, " ")}</strong>
          <span>{notification.message}</span>
        </div>
        {!notification.read_at && <button className="shrink-0 font-semibold text-[var(--accent)]"
          onClick={async () => {
            if (!sb) return;
            const { error: markError } = await sb.rpc("mark_gst_notification_read", { p_notification_id: notification.id });
            if (markError) { setMessage(markError.message); return; }
            await mutate();
          }}>Mark read</button>}
      </div>)}
    </div>
  </Card>;
}

export function GstPaymentsPanel({ role, filingId, riskOnly = false }: { role: string; filingId?: string; riskOnly?: boolean }) {
  const { data = [], error, isLoading, mutate } = useGstPayments();
  const { mutate: mutateCache } = useSWRConfig();
  const [filter, setFilter] = useState<(typeof statuses)[number]>("all");
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [turnover, setTurnover] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    amount: "",
    paid_on: new Date().toISOString().slice(0, 10),
    method: "NEFT",
    challan_no: "",
    advance: false,
  });

  const visible = useMemo(() => data.filter((row) =>
    (!filingId || row.filing_id === filingId)
    && (filter === "all" || row.summary.status === filter)
    && (!riskOnly || (Number(row.summary.balance) > 0
      && (row.summary.status === "overdue" || row.summary.due_within_three_days)))
  ), [data, filingId, filter, riskOnly]);

  async function recordPayment(e: React.FormEvent, row: GstPaymentRow) {
    e.preventDefault();
    const sb = createClient();
    if (!sb) { setMessage("Connect Supabase to record a GST payment."); return; }
    setBusy(row.id);
    setMessage("");
    const { error: rpcError } = await sb.rpc("record_gst_payment", {
      p_filing_payment_id: row.id,
      p_amount: Number(form.amount),
      p_paid_on: form.paid_on,
      p_method: form.method,
      p_challan_no: form.challan_no,
      p_proof_path: null,
      p_is_advance: form.advance,
    });
    if (rpcError) {
      setMessage(rpcError.message);
    } else {
      setMessage("Payment recorded.");
      setForm({ ...form, amount: "", challan_no: "", advance: false });
      await mutate();
    }
    setBusy(null);
  }

  async function uploadProof(e: React.ChangeEvent<HTMLInputElement>, row: GstPaymentRow) {
    const file = e.target.files?.[0];
    if (!file) return;
    const sb = createClient();
    if (!sb) { setMessage("Connect Supabase to upload challan proof."); return; }
    if (file.size > 10 * 1024 * 1024) { setMessage("Challan proof must be 10 MB or smaller."); return; }
    setBusy(row.id);
    setMessage("");
    const path = `${row.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error: uploadError } = await sb.storage.from("gst-payment-proofs").upload(path, file, { upsert: false });
    if (uploadError) {
      setMessage(uploadError.message);
      setBusy(null);
      e.target.value = "";
      return;
    }
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      await sb.storage.from("gst-payment-proofs").remove([path]);
      setMessage("Sign in again before uploading challan proof.");
      setBusy(null);
      e.target.value = "";
      return;
    }
    const { error: insertError } = await sb.from("gst_payment_proofs").insert({
      filing_payment_id: row.id,
      proof_path: path,
      uploaded_by: user.id,
    });
    if (insertError) {
      await sb.storage.from("gst-payment-proofs").remove([path]);
      setMessage(insertError.message);
    } else {
      setMessage("Challan proof uploaded for staff verification. It does not mark the payment as paid.");
      await mutate();
    }
    setBusy(null);
    e.target.value = "";
  }

  async function viewProof(path: string) {
    const sb = createClient();
    if (!sb) return;
    const { data, error: signedUrlError } = await sb.storage.from("gst-payment-proofs").createSignedUrl(path, 60);
    if (signedUrlError) { setMessage(signedUrlError.message); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function verifyProof(row: GstPaymentRow, proofId: string) {
    const reason = window.prompt("Confirm this challan is valid and the payment is received. Enter the verification reason:");
    if (!reason?.trim()) return;
    const sb = createClient();
    if (!sb) { setMessage("Connect Supabase to verify challan proof."); return; }
    setBusy(row.id);
    setMessage("");
    const { error: rpcError } = await sb.rpc("verify_gst_payment_proof", {
      p_proof_id: proofId,
      p_reason: reason.trim(),
    });
    if (rpcError) setMessage(rpcError.message);
    else {
      setMessage("Challan verified; payment status recalculated.");
      await mutate();
      await mutateCache("filings");
    }
    setBusy(null);
  }

  async function saveTurnover(e: React.FormEvent, row: GstPaymentRow) {
    e.preventDefault();
    const value = Number(turnover[row.id]);
    const sb = createClient();
    if (!sb) { setMessage("Connect Supabase to save client turnover."); return; }
    setBusy(row.id);
    setMessage("");
    const { error: rpcError } = await sb.rpc("set_gst_client_turnover", {
      p_client_id: row.client_id,
      p_turnover: value,
    });
    if (rpcError) setMessage(rpcError.message);
    else { setMessage("Turnover saved and any pending late fee recalculated."); await mutate(); }
    setBusy(null);
  }

  async function override(e: React.FormEvent<HTMLFormElement>, row: GstPaymentRow) {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    const sb = createClient();
    if (!sb) { setMessage("Connect Supabase to apply an override."); return; }
    setBusy(row.id);
    setMessage("");
    const { error: rpcError } = await sb.rpc("override_gst_payment", {
      p_filing_payment_id: row.id,
      p_override_type: String(values.get("override_type")),
      p_new_value: Number(values.get("new_value")),
      p_reason: String(values.get("reason")),
    });
    if (rpcError) setMessage(rpcError.message);
    else {
      setMessage("Audited filing override saved.");
      await mutate();
      await mutateCache("filings");
    }
    setBusy(null);
  }

  if (isLoading) return <Card><div className="skeleton h-32" /></Card>;
  if (error) return <Card><p className="text-sm text-[#DC2626]">Could not load GST payments: {error.message}</p></Card>;
  if (!data.length) return null;

  return (
    <section className="space-y-3">
      <GstNotificationFeed />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{riskOnly ? "Late fee / interest risk" : "GST payment ledger"}</h2>
          <p className="text-xs" style={{ color: "var(--text-2)" }}>{riskOnly
            ? "Filed returns due within 3 days or overdue; accrued charges and daily interest are shown."
            : "Tax, interest and late fee are accounted separately in INR."}</p>
        </div>
        {!filingId && !riskOnly && <div className="flex flex-wrap gap-1">
          {statuses.map((status) => <button key={status} onClick={() => setFilter(status)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === status ? "text-white" : ""}`}
            style={filter === status ? { background: "var(--accent)" } : { background: "var(--surface)", border: "1px solid var(--border)" }}>
            {status === "all" ? "All" : status.replace(/_/g, " ")}
          </button>)}
        </div>}
      </div>
      {data.some((row) => !row.summary.rules_confirmed) && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "#D97706", background: "var(--warn-bg)", color: "var(--warn-tx)" }}>
          GST charges are provisional: rates have not been confirmed against the latest government notification by your CA.
        </div>
      )}
      {message && <p role="status" className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>{message}</p>}

      {visible.map((row) => {
        const s = row.summary;
        return (
          <Card key={row.id} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">Filed {row.filed_on}</strong>
              <Badge tone={paymentTone(s.status)}>{s.status.replace(/_/g, " ")}</Badge>
              {s.turnover_required && <Badge tone="warning">Previous FY turnover required</Badge>}
              {s.wrong_itc_confirmation_required && <Badge tone="danger">Wrongly availed ITC · admin review</Badge>}
              {s.wrong_itc_payable > 0 && <Badge tone="danger">Wrongly availed ITC confirmed</Badge>}
              <span className="ml-auto text-sm font-bold tnum">Balance {formatMoney(s.balance)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-6">
              <Amount label="Tax" amount={Number(s.tax_payable) + Number(s.wrong_itc_payable)} />
              <Amount label={s.status === "overdue"
                ? `Interest accrued till today · +${formatMoney(Number(s.daily_interest_accrual))}/day`
                : riskOnly ? `Interest risk · +${formatMoney(Number(s.daily_interest_accrual))}/day` : "Interest"} amount={Number(s.interest_due)} />
              {Number(s.wrong_itc_interest_due) > 0 && <Amount label="Wrongly utilized ITC interest" amount={Number(s.wrong_itc_interest_due)} />}
              <Amount label="Late fee (total)" amount={Number(s.late_fee_due)} />
              <Amount label="Total" amount={Number(s.total_due)} />
              <Amount label="Paid" amount={Number(s.amount_paid)} />
              <Amount label="Credit carried forward" amount={Number(s.credit_carry_forward)} />
            </div>
            {s.component_breakdown_available ? (
              <div className="space-y-1 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--bg)" }}>
                <strong>Tax component breakdown</strong>
                <p>CGST · Output {formatMoney(Number(s.output_gst_cgst))} · ITC {formatMoney(Number(s.eligible_itc_cgst))} · Net tax {formatMoney(Number(s.tax_payable_cgst))} · Interest allocation {formatMoney(Number(s.interest_cgst))} · Late fee {formatMoney(Number(s.late_fee_cgst))}</p>
                <p>SGST · Output {formatMoney(Number(s.output_gst_sgst))} · ITC {formatMoney(Number(s.eligible_itc_sgst))} · Net tax {formatMoney(Number(s.tax_payable_sgst))} · Interest allocation {formatMoney(Number(s.interest_sgst))} · Late fee {formatMoney(Number(s.late_fee_sgst))}</p>
                <p>IGST · Output {formatMoney(Number(s.output_gst_igst))} · ITC {formatMoney(Number(s.eligible_itc_igst))} · Net tax {formatMoney(Number(s.tax_payable_igst))} · Interest allocation {formatMoney(Number(s.interest_igst))} · Late fee {formatMoney(Number(s.late_fee_igst))}</p>
                <p style={{ color: "var(--text-2)" }}>Normal interest is allocated in proportion to net cash tax; wrongly utilized ITC interest is shown separately. Late fee is split equally between CGST and SGST.</p>
              </div>
            ) : <p className="text-xs" style={{ color: "var(--text-2)" }}>Component breakdown was not recorded for this existing filing.</p>}
            {s.turnover_required && role !== "client" && <form onSubmit={(e) => saveTurnover(e, row)} className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs font-semibold">Enter previous FY aggregate turnover to calculate the capped late fee:</span>
              <input required min="0" step="0.01" type="number" value={turnover[row.id] ?? ""}
                onChange={(e) => setTurnover({ ...turnover, [row.id]: e.target.value })}
                className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
              <Button disabled={busy === row.id}>Save turnover</Button>
            </form>}
            {s.wrong_itc_confirmation_required && (
              <p className="text-xs" style={{ color: "var(--text-2)" }}>
                Wrongly utilized ITC awaiting admin review is not yet added to payable tax or interest.
              </p>
            )}
            {row.transactions.length > 0 && (
              <div className="space-y-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs font-semibold">Payment history</p>
                {row.transactions.map((tx) => <p key={tx.id} className="text-xs" style={{ color: "var(--text-2)" }}>
                  {tx.paid_on} · {tx.method} · {tx.challan_no} · {formatMoney(Number(tx.amount))}
                </p>)}
              </div>
            )}
            {row.proofs.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="font-semibold">Client challan proofs:</span>
                {row.proofs.map((proof) => <span key={proof.id} className="flex items-center gap-2">
                  <button className="text-[var(--accent)] underline" onClick={() => viewProof(proof.proof_path)}>View uploaded proof</button>
                  <Badge tone={proof.verified_at ? "success" : "warning"}>{proof.verified_at ? "verified" : "awaiting verification"}</Badge>
                  {role !== "client" && !proof.verified_at && <button disabled={busy === row.id}
                    className="font-semibold text-[var(--accent)] underline" onClick={() => verifyProof(row, proof.id)}>Verify challan</button>}
                </span>)}
              </div>
            )}
            {role === "client" ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--accent)]">
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="max-w-[230px] text-xs"
                  disabled={busy === row.id} onChange={(e) => uploadProof(e, row)} />
                Upload challan proof (staff verification required)
              </label>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setActive(active === row.id ? null : row.id)}>
                  {active === row.id ? "Close payment form" : "Record payment"}
                </Button>
                {role === "admin" && <details className="w-full">
                  <summary className="cursor-pointer text-xs font-semibold">Override charge / confirm wrongly availed ITC</summary>
                  <form onSubmit={(e) => override(e, row)} className="mt-2 grid gap-2 md:grid-cols-4">
                    <select name="override_type" className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
                      <option value="interest">Override interest</option><option value="late_fee">Override late fee</option>
                      <option value="wrong_itc_confirmation">Confirm wrongly utilized ITC</option>
                    </select>
                    <input name="new_value" type="number" min="0" step="0.01" required placeholder="INR amount (1 = confirm ITC)"
                      className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
                    <input name="reason" required placeholder="Mandatory reason"
                      className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
                    <Button disabled={busy === row.id}>Save audited override</Button>
                  </form>
                </details>}
              </div>
            )}
            {active === row.id && role !== "client" && (
              <form onSubmit={(e) => recordPayment(e, row)} className="grid gap-2 border-t pt-3 md:grid-cols-5" style={{ borderColor: "var(--border)" }}>
                <input required name="amount" type="number" min="0.01" step="0.01" value={form.amount} placeholder="Amount (₹)"
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
                <input required type="date" value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })}
                  className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
                <SearchSelect label="Payment method" value={form.method} onChange={(id) => setForm({ ...form, method: id })}
                  options={["NEFT", "RTGS", "UPI", "Net banking", "Other"].map((m) => ({ id: m, label: m }))}
                  clearable={false} autoSelectSingle={false} />
                <input required value={form.challan_no} onChange={(e) => setForm({ ...form, challan_no: e.target.value })}
                  placeholder="CPIN / CIN challan number" className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={form.advance}
                    onChange={(e) => setForm({ ...form, advance: e.target.checked })} /> Advance</label>
                  <Button disabled={busy === row.id}>Save payment</Button>
                </div>
              </form>
            )}
          </Card>
        );
      })}
      {!visible.length && <Card><p className="text-sm" style={{ color: "var(--text-2)" }}>No GST payments match this filter.</p></Card>}
    </section>
  );
}

function Amount({ label, amount }: { label: string; amount: number }) {
  return <div className="rounded-lg p-2" style={{ background: "var(--bg)" }}>
    <span className="block text-[10px] uppercase" style={{ color: "var(--text-2)" }}>{label}</span>
    <strong className="tnum">{formatMoney(amount)}</strong>
  </div>;
}

type RuleRow = {
  firm_id: string | null;
  rule_name: string;
  rate_or_amount: number;
  cap: number | null;
  applies_to: string;
  version: number;
  is_confirmed: boolean;
  notification_ref: string | null;
  checked_at: string | null;
};

const ruleLabels: Record<string, string> = {
  interest_normal: "Normal interest (% p.a.)",
  interest_wrong_itc: "Wrongly utilized ITC interest (% p.a.)",
  late_fee_per_day: "Late fee per day (tax liability)",
  late_fee_nil_per_day: "Late fee per day (nil return)",
  late_fee_cap_low: "Late fee cap (turnover up to ₹1.5 crore)",
  late_fee_cap_mid: "Late fee cap (turnover ₹1.5–5 crore)",
  late_fee_cap_high: "Late fee cap (turnover above ₹5 crore)",
  turnover_threshold_low: "Turnover lower threshold",
  turnover_threshold_high: "Turnover upper threshold",
  payment_allocation_order: "Payment allocation order",
};

export function GstRulesSettings() {
  const sb = createClient();
  const { data, error, mutate } = useSWR<RuleRow[]>("gst-rules", async () => {
    if (!sb) return [];
    const { data: rows, error: queryError } = await sb.from("gst_rules").select("*")
      .order("effective_from", { ascending: false });
    if (queryError) throw queryError;
    return (rows ?? []) as RuleRow[];
  });
  const [edited, setEdited] = useState<Record<string, RuleRow>>({});
  const [reference, setReference] = useState("");
  const [checkedAt, setCheckedAt] = useState(new Date().toISOString().slice(0, 10));
  const [confirmRules, setConfirmRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const latest = useMemo(() => {
    const resolved = new Map<string, RuleRow>();
    for (const row of data ?? []) {
      const current = resolved.get(row.rule_name);
      if (!current || (row.firm_id && !current.firm_id)) resolved.set(row.rule_name, row);
    }
    return [...resolved.values()].sort((a, b) => a.rule_name.localeCompare(b.rule_name));
  }, [data]);

  async function saveRules(e: React.FormEvent) {
    e.preventDefault();
    if (!sb) { setMessage("Connect Supabase to edit GST rules."); return; }
    if (confirmRules && !reference.trim()) { setMessage("Enter the latest government notification reference before CA confirmation."); return; }
    setBusy(true);
    setMessage("");
    for (const rule of latest) {
      const value = edited[rule.rule_name] ?? rule;
      const { error: rpcError } = await sb.rpc("publish_gst_rule", {
        p_rule_name: rule.rule_name,
        p_rate_or_amount: Number(value.rate_or_amount),
        p_cap: value.cap === null ? null : Number(value.cap),
        p_applies_to: rule.rule_name === "payment_allocation_order" ? value.applies_to : rule.applies_to,
        p_effective_from: new Date().toISOString().slice(0, 10),
        p_notification_ref: reference.trim() || null,
        p_checked_at: confirmRules ? checkedAt : null,
        p_confirmed: confirmRules,
      });
      if (rpcError) {
        setMessage(rpcError.message);
        setBusy(false);
        return;
      }
    }
    setMessage(confirmRules
      ? "New CA-confirmed GST rule versions are active for future filings. Existing filings retain their snapshots."
      : "New draft GST rule versions saved. They will not be treated as confirmed until CA verification.");
    setEdited({});
    await mutate();
    setBusy(false);
  }

  if (error) return <Card><p className="text-sm text-[#DC2626]">Could not load GST rules: {error.message}</p></Card>;

  return (
    <Card>
      <h2 className="mb-2 font-semibold">GST interest and late-fee rules</h2>
      <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "#D97706", background: "var(--warn-bg)", color: "var(--warn-tx)" }}>
        Rates must match the latest government notification. Seed values are unverified proposals, not tax advice.
        Confirm the conflicting nil-return fee and other rates with your CA before activating them.
      </div>
      <p className="mb-3 text-xs" style={{ color: "var(--text-2)" }}>
        Saving creates new immutable rule versions; calculations on existing filings are not changed.
      </p>
      {!data ? <div className="skeleton h-32" /> : (
        <form onSubmit={saveRules} className="space-y-3">
          {latest.map((rule) => {
            const value = edited[rule.rule_name] ?? rule;
            return <div key={rule.rule_name} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1.4fr_1fr_1fr_1fr]" style={{ borderColor: "var(--border)" }}>
              <div>
                <strong className="block text-sm">{ruleLabels[rule.rule_name] ?? rule.rule_name}</strong>
                <span className="text-xs" style={{ color: "var(--text-2)" }}>
                  v{rule.version} · {rule.is_confirmed ? `CA confirmed${rule.checked_at ? ` ${rule.checked_at}` : ""}` : "unverified draft"}
                </span>
              </div>
              {rule.rule_name === "payment_allocation_order" ? (
                <select value={value.applies_to} onChange={(e) => setEdited({ ...edited, [rule.rule_name]: { ...value, applies_to: e.target.value } })}
                  className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
                  {["late_fee,interest,tax", "interest,late_fee,tax", "tax,interest,late_fee"].map((v) => <option key={v} value={v}>{v.replace(/,/g, " → ")}</option>)}
                </select>
              ) : (
                <input aria-label={`${rule.rule_name} value`} type="number" min="0" step="0.01" required
                  value={value.rate_or_amount}
                  onChange={(e) => setEdited({ ...edited, [rule.rule_name]: { ...value, rate_or_amount: Number(e.target.value) } })}
                  className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
              )}
              <input aria-label={`${rule.rule_name} cap`} type="number" min="0" step="0.01"
                value={value.cap ?? ""}
                placeholder="Cap (optional)"
                onChange={(e) => setEdited({ ...edited, [rule.rule_name]: { ...value, cap: e.target.value === "" ? null : Number(e.target.value) } })}
                className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
              <span className="self-center text-xs" style={{ color: "var(--text-2)" }}>{rule.applies_to}</span>
            </div>;
          })}
          <div className="grid gap-2 md:grid-cols-3">
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="CBIC notification reference (required to confirm)"
              className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
            <input type="date" value={checkedAt} onChange={(e) => setCheckedAt(e.target.value)}
              className="rounded-lg border p-2 text-sm" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmRules} onChange={(e) => setConfirmRules(e.target.checked)} />
              CA-confirmed; activate these versions
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy || !latest.length}>{busy ? "Saving…" : "Save versioned GST rules"}</Button>
            {message && <span role="status" className="text-sm">{message}</span>}
          </div>
        </form>
      )}
    </Card>
  );
}
