"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import { Users, FileClock, Receipt, CheckCircle2, Plus, Download, ArrowUpRight, CircleAlert, Clock3 } from "lucide-react";
import { Badge, EmptyState } from "./ui";
import { useFilings, useTasks, useClients, usePayments, useActivity } from "@/lib/hooks";
import { dueLabel, greeting, formatMoney, toCSV, downloadFile } from "@/lib/data";
import { FILING_STAGES, normalizeStage, isComplete, isFiledOrLater, isOverdue } from "@/lib/lifecycle";
import { PREMIUM, TOOLTIP, PremHero, PremKpi, PremCard, PremBtn } from "./premium-theme";

const T = PREMIUM.admin;

export function AdminDashboardPremium() {
  const { data: filings = [] } = useFilings();
  const { data: tasks = [] } = useTasks();
  const { data: clients = [] } = useClients();
  const { data: payments = [] } = usePayments();
  const { data: activity = [] } = useActivity();

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dueThisMonth = filings.filter((f) => (f.due_date ?? "").slice(0, 7) === monthKey).length;
  const pendingVAT = filings.filter((f) => f.tax_type.toLowerCase().includes("vat") && !isFiledOrLater(String(f.status))).length;
  const doneQuarter = filings.filter((f) => isComplete(String(f.status))).length;
  const outstanding = useMemo(() => payments.filter((p) => p.status !== "paid").reduce((s, p) => s + Number(p.amount || 0), 0), [payments]);
  const openTasks = tasks.filter((t) => !["done", "cancelled"].includes(String(t.status)));
  const overdueTasks = tasks.filter((t) => !["done", "cancelled"].includes(String(t.status)) && !!t.due_date && t.due_date < now.toISOString().slice(0, 10));

  const trend = useMemo(() => {
    const out: { m: string; done: number; overdue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inMonth = filings.filter((f) => (f.due_date ?? "").slice(0, 7) === key);
      out.push({ m: d.toLocaleString("en", { month: "short" }), done: inMonth.filter((f) => isComplete(String(f.status))).length, overdue: inMonth.filter((f) => isOverdue(String(f.status), f.due_date)).length });
    }
    return out;
  }, [filings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const stageMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filings) {
      if (isOverdue(String(f.status), f.due_date)) { m.set("Overdue", (m.get("Overdue") ?? 0) + 1); continue; }
      const k = FILING_STAGES.find((s) => s.key === normalizeStage(String(f.status)))?.label ?? String(f.status);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [filings]);

  const sorted = [...filings].sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date)).slice(0, 6);

  return (
    <div className="prem-enter space-y-5">
      <PremHero role="admin" eyebrow="Firm command center" title={`${greeting()}, Admin`}
        sub={`Apex Tax Advisors · ${clients.length} active clients · ${openTasks.length} open tasks · ${formatMoney(outstanding)} outstanding`}
        stats={[{ v: String(clients.length), l: "Clients" }, { v: String(dueThisMonth), l: "Due / mo" }, { v: String(overdueTasks.length), l: "Overdue" }]}
        actions={<><PremBtn role="admin" href="/admin/tax-filings"><Plus size={14} /> New filing</PremBtn><PremBtn role="admin" href="/admin/clients" ghost>Clients</PremBtn></>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PremKpi role="admin" label="Active clients" value={String(clients.length)} hint="+4 this month" icon={<Users size={19} />} spark={[4, 6, 5, 8, 9, Math.max(9, clients.length)]} />
        <PremKpi role="admin" label="Due this month" value={String(dueThisMonth)} hint="Across all taxes" icon={<FileClock size={19} />} spark={[2, 3, 5, 4, 6, Math.max(6, dueThisMonth)]} />
        <PremKpi role="admin" label="Pending VAT" value={String(pendingVAT)} hint="Not yet filed" icon={<Receipt size={19} />} />
        <PremKpi role="admin" label="Completed" value={String(doneQuarter)} hint="Filed & done" icon={<CheckCircle2 size={19} />} spark={[3, 5, 4, 7, 8, Math.max(8, doneQuarter)]} />
      </div>

      {outstanding > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border px-5 py-4 text-sm" style={{ background: "var(--warn-bg)", borderColor: "var(--border)" }}>
          <CircleAlert size={16} style={{ color: "var(--warn-tx)" }} />
          <span className="font-bold" style={{ color: "var(--warn-tx)" }}>Outstanding firm-wide: {formatMoney(outstanding)}</span>
          <Link href="/admin/payments" className="ml-auto font-bold underline" style={{ color: "var(--warn-tx)" }}>View invoices</Link>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <PremCard title="Completion vs overdue" sub="Last 6 months" action={<Link href="/admin/tax-filings" className="inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: T.primary }}>All filings <ArrowUpRight size={13} /></Link>}>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="admDone" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.primary} stopOpacity={0.32} /><stop offset="100%" stopColor={T.primary} stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Area type="monotone" dataKey="done" name="Completed" stroke={T.primary} strokeWidth={2.5} fill="url(#admDone)" />
                <Area type="monotone" dataKey="overdue" name="Overdue" stroke="#DC2626" strokeWidth={2.5} fill="#DC262622" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </PremCard>
        <PremCard title="Stage mix" sub="Share by lifecycle stage">
          {stageMap.length === 0 ? <EmptyState icon={<FileClock size={22} />} title="No filings yet" /> : (
            <>
              <div className="h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={stageMap} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} strokeWidth={0}>
                    {stageMap.map((_, i) => <Cell key={i} fill={T.chart[i % T.chart.length]} />)}
                  </Pie><Tooltip contentStyle={TOOLTIP} /></PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 space-y-1.5">
                {stageMap.slice(0, 4).map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 rounded-full" style={{ background: T.chart[i % T.chart.length] }} /><span className="font-semibold">{d.name}</span><span className="tnum ml-auto" style={{ color: "var(--text-2)" }}>{d.value}</span></div>
                ))}
              </div>
            </>
          )}
        </PremCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PremCard title="Deadline tracker" sub="Next 6 by due date" action={<Link href="/admin/tax-filings" className="text-xs font-bold hover:underline" style={{ color: T.primary }}>View all →</Link>}>
          {sorted.length === 0 ? <EmptyState icon={<Clock3 size={22} />} title="No upcoming deadlines" /> : (
            <div className="space-y-2">
              {sorted.map((f) => (
                <Link key={f.id} href="/admin/tax-filings" className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors hover:bg-black/[0.02]" style={{ borderColor: "var(--border)" }}>
                  <div className="min-w-0 flex-1"><p className="truncate font-bold">{f.tax_type} · {f.period}</p><p className="text-xs" style={{ color: "var(--text-2)" }}>{String(f.client_name ?? "").slice(0, 24)} · due {f.due_date}</p></div>
                  <Badge tone={dueLabel(f.due_date).includes("overdue") ? "danger" : "warning"}>{dueLabel(f.due_date)}</Badge>
                </Link>
              ))}
            </div>
          )}
        </PremCard>
        <PremCard title="Recent activity" sub="Latest firm actions" action={<button onClick={() => downloadFile("taxdesk-filings.csv", toCSV(filings as unknown as Record<string, unknown>[]))} className="inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: T.primary }}><Download size={13} /> Export</button>}>
          {activity.length === 0 ? <EmptyState icon={<FileClock size={22} />} title="No activity yet" /> : (
            <div className="max-h-[260px] space-y-3 overflow-y-auto">
              {activity.slice(0, 12).map((a) => (
                <div key={a.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: T.primary }} />
                  <div className="min-w-0"><span className="font-bold">{a.actor_name ?? "Someone"}</span> <span style={{ color: "var(--text-2)" }}>{a.action} {a.entity_type}</span>
                    <p className="text-xs" style={{ color: "var(--text-2)" }}>{new Date(a.created_at).toLocaleString()}</p></div>
                </div>
              ))}
            </div>
          )}
        </PremCard>
      </div>
    </div>
  );
}
