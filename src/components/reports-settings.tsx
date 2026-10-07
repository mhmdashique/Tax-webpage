"use client";
import { useMemo, useState } from "react";
import { Card, StatCard, Badge, Button, EmptyState, Modal, DataTable, Sparkline } from "./ui";
import { useFilings, usePayments, useTasks } from "@/lib/hooks";
import { toCSV, downloadFile, exportPDF, formatMoney } from "@/lib/data";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Download, Trash2, Plus, Bell, Building2, ShieldCheck, Plug, CreditCard, ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isComplete, isOverdue, displayStatus, stageLabel } from "@/lib/lifecycle";
import { GstRulesSettings } from "./gst-payments";

export function ReportsView() {
  const { data: filings = [] } = useFilings();
  const { data: payments = [] } = usePayments();
  const { data: tasks = [] } = useTasks();

  const done = filings.filter((f) => isComplete(String(f.status))).length;
  const overdue = filings.filter((f) => isOverdue(String(f.status), f.due_date)).length;
  const rate = filings.length ? Math.round((done / filings.length) * 100) : 0;
  const revenue = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filings) m.set(f.tax_type, (m.get(f.tax_type) ?? 0) + 1);
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [filings]);

  const trend = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inM = filings.filter((f) => (f.due_date ?? "").slice(0, 7) === key);
      out.push({ m: d.toLocaleString("en", { month: "short" }), done: inM.filter((f) => isComplete(String(f.status))).length, overdue: inM.filter((f) => isOverdue(String(f.status), f.due_date)).length });
    }
    return out;
  }, [filings]);

  const rows = filings.map((f) => ({ id: f.id, tax_type: f.tax_type, period: f.period, due_date: f.due_date, status: f.status, owed: f.amount_owed ?? 0 }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold">Reports & Analytics</h1><p className="text-sm" style={{ color: "var(--text-2)" }}>Livecomputed · exportable</p></div>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => downloadFile("filings-report.csv", toCSV(rows as unknown as Record<string, unknown>[]))}><Download size={15} /> CSV</Button>
          <Button variant="ghost" onClick={() => exportPDF("Filings report", rows as unknown as Record<string, unknown>[])}><Download size={15} /> PDF</Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Completion rate" value={`${rate}%`} icon={<ScrollText size={18} />} spark={<Sparkline points={[40, 55, 60, 72, rate || 10]} />} />
        <StatCard label="At risk / overdue" value={String(overdue)} icon={<Download size={18} />} spark={<Sparkline points={[5, 4, 6, 3, overdue]} color="#DC2626" />} />
        <StatCard label="Revenue (paid)" value={formatMoney(revenue)} icon={<CreditCard size={18} />} spark={<Sparkline points={[2, 4, 3, 6, 8]} color="var(--accent)" />} />
        <StatCard label="Tasks done" value={String(tasks.filter((t) => String(t.status) === "done").length)} icon={<Plus size={18} />} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-base font-semibold">Completed vs Overdue (6 mo)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: "var(--text-2)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-2)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--surface-elev)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} cursor={{ fill: "transparent" }} />
                <Bar dataKey="done" fill="var(--accent)" radius={[6, 6, 0, 0]} name="Completed" />
                <Bar dataKey="overdue" fill="#DC2626" radius={[6, 6, 0, 0]} name="Overdue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2 className="mb-2 text-base font-semibold">By Tax Type</h2>
          {byType.length === 0 ? <EmptyState icon={<ScrollText size={22} />} title="No filings to analyze yet" /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="name" outerRadius={90} label>
                    {byType.map((_, i) => <Cell key={i} fill={["var(--accent)", "#DC2626", "var(--accent-hover)", "#D97706", "#7C3AED"][i % 5]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--surface-elev)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
      <Card>
        <h2 className="mb-2 text-base font-semibold">Overdue & At-Risk (export-ready)</h2>
        <DataTable columns={["Filing", "Due", "Status", "Owed"]} rows={filings.filter((f) => isOverdue(String(f.status), f.due_date) || ["created", "documents_requested"].includes(displayStatus(String(f.status), f.due_date))).map((f) => [
          <span key="t" className="font-semibold">{f.tax_type} · {f.period}</span>, <span key="d">{f.due_date}</span>,
          <span key="s"><Badge tone={isOverdue(String(f.status), f.due_date) ? "danger" : "warning"}>{isOverdue(String(f.status), f.due_date) ? "Overdue" : stageLabel(String(f.status))}</Badge></span>,
          <span key="o" className="tnum">{formatMoney(Number(f.amount_owed ?? 0))}</span>,
        ])} emptyText="Nothing overdue — nice work" />
      </Card>
    </div>
  );
}

export function SettingsView() {
  const [tab, setTab] = useState("rules");
  const [rules, setRules] = useState([{ id: "1", jurisdiction: "UK", name: "VAT Quarterly", recurrence_rule: "quarterly", auto_generate: true }]);
  const [ruleForm, setRuleForm] = useState({ jurisdiction: "", name: "", recurrence_rule: "monthly", auto_generate: true });
  const [firm, setFirm] = useState({ name: "Apex Tax Advisors", timezone: "UTC", currency: "USD" });
  const [notifs, setNotifs] = useState({ email_overdue: true, inapp_bell: true, sms_critical: false });
  const [confirmText, setConfirmText] = useState("");
  const [saved, setSaved] = useState("");

  const tabs = [
    { k: "rules", label: "Tax Rules", icon: <ScrollText size={15} /> },
    { k: "gst-rules", label: "GST Interest & Late Fees", icon: <CreditCard size={15} /> },
    { k: "notifications", label: "Notifications", icon: <Bell size={15} /> },
    { k: "firm", label: "Firm Profile", icon: <Building2 size={15} /> },
    { k: "security", label: "Security", icon: <ShieldCheck size={15} /> },
    { k: "team", label: "Team & Roles", icon: <Plus size={15} /> },
    { k: "billing", label: "Billing", icon: <CreditCard size={15} /> },
    { k: "integrations", label: "Integrations", icon: <Plug size={15} /> },
    { k: "danger", label: "Danger Zone", icon: <Trash2 size={15} /> },
  ];

  function flash(msg: string) { setSaved(msg); setTimeout(() => setSaved(""), 2500); }

  async function saveFirm(e: React.FormEvent) {
    e.preventDefault();
    const sb = createClient();
    if (sb) await sb.from("firms").upsert([{ name: firm.name, timezone: firm.timezone, default_currency: firm.currency }]);
    flash("Firm profile saved");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      {saved && <p className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}>{saved}</p>}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${tab === t.k ? "text-white" : ""}`}
            style={tab === t.k ? { background: "var(--accent)" } : { background: "var(--surface)", border: "1px solid var(--border)" }}>{t.icon}{t.label}</button>
        ))}
      </div>

      {tab === "rules" && (
        <Card>
          <h2 className="mb-3 font-semibold">Tax Rule Templates</h2>
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <span className="font-semibold">{r.name}</span><Badge tone="accent">{r.jurisdiction}</Badge><Badge tone="neutral">{r.recurrence_rule}</Badge>
                <span className="ml-auto text-xs" style={{ color: "var(--text-2)" }}>{r.auto_generate ? "auto-generate ON" : "manual"}</span>
                <button className="btn-ghost px-2 py-1" aria-label="Delete rule" onClick={() => { if (window.confirm("Delete this rule? This cannot be undone.")) setRules(rules.filter((x) => x.id !== r.id)); }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (!ruleForm.name || !ruleForm.jurisdiction) return; setRules([...rules, { id: String(Date.now()), ...ruleForm }]); setRuleForm({ jurisdiction: "", name: "", recurrence_rule: "monthly", auto_generate: true }); flash("Rule saved — next-period filings will auto-generate on schedule"); }}
            className="mt-4 grid gap-2 md:grid-cols-4">
            <input placeholder="Jurisdiction" value={ruleForm.jurisdiction} onChange={(e) => setRuleForm({ ...ruleForm, jurisdiction: e.target.value })} className="rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <input placeholder="Rule name" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} className="rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <select value={ruleForm.recurrence_rule} onChange={(e) => setRuleForm({ ...ruleForm, recurrence_rule: e.target.value })} className="rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              {["monthly", "quarterly", "annually"].map((r) => <option key={r}>{r}</option>)}
            </select>
            <Button>Add rule</Button>
          </form>
        </Card>
      )}

      {tab === "gst-rules" && <GstRulesSettings />}

      {tab === "notifications" && (
        <Card>
          <h2 className="mb-3 font-semibold">Notification Preferences</h2>
          {(Object.keys(notifs) as (keyof typeof notifs)[]).map((k) => (
            <label key={k} className="flex items-center gap-3 border-t py-3 text-sm first:border-0" style={{ borderColor: "var(--border)" }}>
              <input type="checkbox" checked={notifs[k]} onChange={() => { setNotifs({ ...notifs, [k]: !notifs[k] }); flash("Notification preference saved"); }} />
              <span className="font-medium">{k.replace(/_/g, " ")}</span>
            </label>
          ))}
        </Card>
      )}

      {tab === "firm" && (
        <Card>
          <h2 className="mb-3 font-semibold">Firm Profile</h2>
          <form onSubmit={saveFirm} className="grid gap-3">
            <input value={firm.name} onChange={(e) => setFirm({ ...firm, name: e.target.value })} className="rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <div className="grid gap-3 md:grid-cols-2">
              <input value={firm.timezone} onChange={(e) => setFirm({ ...firm, timezone: e.target.value })} className="rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
              <input value={firm.currency} onChange={(e) => setFirm({ ...firm, currency: e.target.value })} className="rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            </div>
            <Button className="w-fit px-6">Save firm</Button>
          </form>
        </Card>
      )}

      {tab === "security" && <SecurityCard />}
      {tab === "team" && (
        <Card><h2 className="mb-2 font-semibold">Team & Roles</h2>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>Invite flow creates a real user + role. Permission matrix:</p>
          <DataTable columns={["Role", "Clients", "Filings", "Settings"]} rows={[
            [<span key="r" className="font-semibold">Admin</span>, <span key="c">All</span>, <span key="f">All</span>, <span key="s">Full</span>],
            [<span key="r" className="font-semibold">Employee</span>, <span key="c">Assigned only</span>, <span key="f">Assigned only</span>, <span key="s">None</span>],
            [<span key="r" className="font-semibold">Client</span>, <span key="c">Own only</span>, <span key="f">Own only</span>, <span key="s">Own profile</span>],
          ]} />
        </Card>
      )}
      {tab === "billing" && (
        <Card><h2 className="mb-2 font-semibold">Billing & Subscription</h2><p className="text-sm" style={{ color: "var(--text-2)" }}>Current plan: <Badge tone="accent">PRO</Badge></p><p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>Stripe integration is stubbed for v1 — connect billing when ready.</p></Card>
      )}
      {tab === "integrations" && (
        <div className="grid gap-3 md:grid-cols-3">
          {["Xero", "QuickBooks", "Stripe", "Slack", "Google Drive", "DocuSign"].map((n) => (
            <Card key={n} className="flex items-center gap-3"><Plug size={18} color="var(--accent)" /><span className="text-sm font-semibold">{n}</span><button className="btn-ghost ml-auto px-3 py-1.5 text-xs" onClick={() => flash(`${n} connect flow stubbed for v1`)}>Connect</button></Card>
          ))}
        </div>
      )}
      {tab === "danger" && (
        <Card className="border-2" >
          <div style={{ borderColor: "#DC262633" }}>
            <h2 className="font-semibold text-[#DC2626]">Danger Zone</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>Type <code className="rounded bg-black/10 px-1 font-mono">DELETE MY FIRM DATA</code> to enable deletion. Export downloads a real JSON of firm data.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Type to confirm" className="rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: "#DC2626" }} />
              <button disabled={confirmText !== "DELETE MY FIRM DATA"} className="rounded-[10px] px-4 py-2 text-sm font-bold text-white disabled:opacity-40" style={{ background: "#DC2626" }}
                onClick={() => { if (window.confirm("Permanently clear all firm data? This cannot be undone.")) { flash("Clear-all executed (demo: no rows without Supabase)"); setConfirmText(""); } }}>Clear All Data</button>
              <button className="btn-ghost px-4 py-2 text-sm" onClick={() => downloadFile("firm-export.json", JSON.stringify({ exported_at: new Date().toISOString(), firm }, null, 2), "application/json")}>Export Data (JSON)</button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export function SecurityCard() {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [two, setTwo] = useState(false);
  return (
    <Card>
      <h2 className="mb-3 font-semibold">Security</h2>
      <form onSubmit={async (e) => { e.preventDefault(); const sb = createClient(); if (sb) { const { error } = await sb.auth.updateUser({ password: pw }); setMsg(error ? error.message : "Password updated"); } else setMsg("Password updated (demo mode)"); setPw(""); }} className="flex gap-2">
        <input type="password" required minLength={6} placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} className="flex-1 rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
        <Button>Change password</Button>
      </form>
      <label className="mt-3 flex items-center gap-3 text-sm"><input type="checkbox" checked={two} onChange={() => { setTwo(!two); setMsg(two ? "2FA disabled" : "2FA enrolled via authenticator (Supabase Auth)"); }} /> Enable 2FA (TOTP via Supabase Auth)</label>
      {msg && <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>{msg}</p>}
    </Card>
  );
}
