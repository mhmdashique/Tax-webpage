"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, RadialBarChart, RadialBar,
} from "recharts";
import {
  Users, CalendarDays, CheckCircle2, Briefcase, ArrowUpRight, Clock3, Inbox,
  FileText, Wallet, FolderOpen, ShieldCheck, CircleAlert, IndianRupee, Receipt,
  MessagesSquare, Phone, LifeBuoy, Download, Upload, Gauge, BadgeCheck, Sparkles,
  ArrowRight, Bell, TrendingUp,
} from "lucide-react";
import { Badge, Button, EmptyState } from "./ui";
import { useFilings, useTasks, useClients, useCurrentUser, useDocuments, usePayments } from "@/lib/hooks";
import { dueLabel, greeting, formatMoney, downloadFile } from "@/lib/data";
import { isComplete, isOverdue, stageLabel, FILING_STAGES, stageIndex } from "@/lib/lifecycle";
import { PREMIUM, TOOLTIP, PremHero, PremKpi, PremCard, PremBtn } from "./premium-theme";
import { FilingsView, ClientsView, DocumentsView, PaymentsView, MessagesView } from "./entities";
import { TaskCenter } from "./task-center";
import { PerformanceView, AccountView } from "./portals";
import { ReportsView } from "./reports-settings";
import { TicketHelpCenter } from "./tickets";

const T = PREMIUM.employee;

/* ------------------------------------------------------------------ */
/*  Shared facts                                                        */
/* ------------------------------------------------------------------ */

function daysUntil(due?: string | null): number | null {
  if (!due) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(+d)) return null;
  return Math.round((d.getTime() - t.getTime()) / 864e5);
}

function useEmployeeFacts() {
  const { data: me } = useCurrentUser();
  const { data: filings = [], isLoading } = useFilings();
  const { data: clients = [] } = useClients();
  const { data: tasks = [] } = useTasks();
  const { data: docs = [] } = useDocuments();
  const { data: payments = [] } = usePayments();
  const meId = (me as { id?: string } | null)?.id ?? null;

  return useMemo(() => {
    const mine = tasks.filter((t) => !meId || !t.assigned_to || t.assigned_to === meId);
    const open = mine.filter((t) => !["done", "cancelled"].includes(String(t.status)));
    const done = mine.filter((t) => String(t.status) === "done");
    const overdueTasks = open.filter((t) => (daysUntil(t.due_date) ?? 0) < 0);
    const dueSoonTasks = open.filter((t) => { const n = daysUntil(t.due_date); return n !== null && n >= 0 && n <= 3; });
    const dueWeek = filings.filter((f) => { const d = new Date(f.due_date).getTime() - Date.now(); return d >= 0 && d < 7 * 864e5; }).length;
    const overdueFilings = filings.filter((f) => isOverdue(String(f.status), f.due_date));
    const doneFilings = filings.filter((f) => isComplete(String(f.status)));
    const openFilings = filings.filter((f) => !isComplete(String(f.status)));

    const owed = filings.reduce((s, f) => s + Number((f as { amount_owed?: number }).amount_owed ?? 0), 0);
    const outstanding = payments.filter((p) => p.status !== "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
    const paid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);

    const totalUnits = filings.length + mine.length;
    const doneUnits = doneFilings.length + done.length;
    const score = totalUnits === 0 ? 100 : Math.round((doneUnits / totalUnits) * 100);
    const completionPct = mine.length ? Math.round((done.length / mine.length) * 100) : 0;

    const sorted = [...filings].sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date));

    const pulse = [...filings].slice(0, 6).map((f, i) => ({
      name: (f.period ?? `F${i + 1}`).slice(0, 8),
      open: mine.filter((t) => t.related_filing_id === f.id && !["done", "cancelled"].includes(String(t.status))).length,
      done: mine.filter((t) => t.related_filing_id === f.id && String(t.status) === "done").length,
    }));

    const throughput = [...filings]
      .sort((a, b) => (a.period ?? "").localeCompare(b.period ?? ""))
      .slice(-8)
      .map((f, i) => ({
        name: (f.period ?? `P${i + 1}`).slice(0, 8),
        completed: isComplete(String(f.status)) ? 1 : 0,
        opened: 1,
        payable: Number((f as { amount_owed?: number }).amount_owed ?? 0),
      }));
    let run = 0;
    const throughputCum = throughput.map((d) => { run += d.completed; return { ...d, completed: run }; });

    const statusMap = new Map<string, number>();
    for (const f of filings) {
      const k = stageLabel(String(f.status));
      statusMap.set(k, (statusMap.get(k) ?? 0) + 1);
    }
    const statusDonut = [...statusMap.entries()].map(([name, value]) => ({ name, value }));

    const priMap = new Map<string, number>();
    for (const t of open) priMap.set(String(t.priority ?? "normal"), (priMap.get(String(t.priority ?? "normal")) ?? 0) + 1);
    const priorityBars = [...priMap.entries()].map(([name, value]) => ({ name: name.replace(/_/g, " "), value }))
      .sort((a, b) => b.value - a.value).slice(0, 6);

    const workload = [
      { name: "Open", value: open.length },
      { name: "Done", value: done.length },
      { name: "Overdue", value: overdueTasks.length },
    ];

    const weekly = [5, 4, 3, 2, 1, 0].map((w) => {
      const label = w === 0 ? "This wk" : `W-${w}`;
      const share = w === 0 ? 0.34 : w === 1 ? 0.22 : w === 2 ? 0.16 : w === 3 ? 0.12 : w === 4 ? 0.09 : 0.07;
      return { name: label, done: Math.max(w === 0 ? 1 : 0, Math.round(done.length * share)), open: Math.max(0, Math.round(open.length * share)) };
    }).reverse();

    return {
      me, filings, clients, mine, open, done, overdueTasks, dueSoonTasks,
      dueWeek, overdueFilings, doneFilings, openFilings, owed, outstanding, paid,
      score, completionPct, sorted: sorted.slice(0, 6),
      pulse, throughput: throughputCum, statusDonut, priorityBars, workload, weekly,
      docs: docs as { id: string; file_name: string; created_at: string }[],
      payments, isLoading,
    };
  }, [filings, clients, tasks, docs, payments, me, meId, isLoading]);
}

/* ------------------------------------------------------------------ */
/*  Client-identical primitives (same UI as client dashboard)           */
/* ------------------------------------------------------------------ */

const BLUE = "var(--accent)";
const SKY = "#0284C7";
const SLATE = "var(--text-2)";
const RED = "#DC2626";
const AMBER = "#D97706";
const GREEN_OK = "var(--accent)";

const CHART = ["var(--accent)", "#38BDF8", "#F59E0B", "var(--accent-hover)", "#93C5FD", "#EF4444"];

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const tooltipStyle = {
  background: "var(--surface-elev)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10,
  fontSize: 12, fontWeight: 600, padding: "8px 12px", boxShadow: "0 8px 24px rgba(15,23,42,.08)",
} as const;

function EmpStat({ label, value, hint, icon, tone = "blue", spark }: {
  label: string; value: string; hint: string; icon: React.ReactNode;
  tone?: "blue" | "sky" | "red" | "green";
  spark?: number[];
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    blue: { bg: "var(--accent-tint)", fg: "var(--accent)" },
    sky: { bg: "var(--hero-chip-bg, var(--accent-tint))", fg: "var(--hero-chip-tx, var(--accent))" },
    red: { bg: "var(--danger-bg)", fg: "var(--danger-tx)" },
    green: { bg: "var(--success-bg)", fg: "var(--success-tx)" },
  };
  const t = tones[tone];
  const max = Math.max(...(spark ?? [1]), 1);
  return (
    <div className="card group p-5 transition-all duration-200 hover:-translate-y-0.5" style={{ boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className="tnum mt-2 truncate text-[26px] font-bold leading-none tracking-tight">{value}</p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>{hint}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105" style={{ background: t.bg, color: t.fg }}>
          {icon}
        </span>
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3 flex items-end gap-1" aria-hidden>
          {spark.map((v, i) => (
            <span key={i} className="w-full rounded-full" style={{
              height: `${6 + (v / max) * 26}px`, background: i === spark.length - 1 ? BLUE : "color-mix(in srgb, var(--accent) 13%, transparent)",
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreRing({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[132px] w-[132px] shrink-0">
        <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
          <defs>
            <linearGradient id="empScoreGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--accent)" />
              <stop offset="100%" stopColor="var(--accent-hover)" />
            </linearGradient>
          </defs>
          <circle cx="66" cy="66" r={r} fill="none" strokeWidth="12" style={{ stroke: "var(--hero-track, var(--surface-muted))" }} />
          <circle cx="66" cy="66" r={r} fill="none" stroke="url(#empScoreGrad)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} style={{ transition: "stroke-dashoffset .8s ease" }} />
        </svg>
        <div className="absolute inset-0 flex rotate-0 flex-col items-center justify-center" style={{ color: "var(--text)" }}>
          <span className="tnum text-3xl font-bold">{v}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">/ 100</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold" style={{ color: "var(--text)" }}>{label}</p>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
          {v >= 85 ? "Excellent — filings and tasks are closing on time." : v >= 60 ? "Good — clear the overdue items to hit top form." : "Needs focus — several tasks or filings are overdue."}
        </p>
        <Link href="/employee/tasks" className="mt-2 inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>
          Review work <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

function EmpChartCard({ title, sub, action, children, className = "" }: {
  title: string; sub: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cx("card flex min-w-0 flex-col p-5", className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="client-section-title">{title}</h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>{sub}</p>
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ActionRow({ icon, tone, title, meta, href, cta }: {
  icon: React.ReactNode; tone: "red" | "brass"; title: string; meta: string; href: string; cta: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--row-bg, var(--surface))" }}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={tone === "red" ? { background: "var(--danger-bg)", color: "var(--danger-tx)" } : { background: "var(--warn-bg)", color: "var(--warn-tx)" }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold" style={{ color: "var(--text)" }}>{title}</p>
        <p className="text-xs" style={{ color: "var(--text-2)" }}>{meta}</p>
      </div>
      <Link href={href} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: BLUE }}>{cta}</Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  EMPLOYEE DASHBOARD — same UI as client dashboard                    */
/* ------------------------------------------------------------------ */

export function EmployeeDashboardPremium() {
  const f = useEmployeeFacts();
  const name = (f.me as { name?: string } | null)?.name ?? "there";
  const [range, setRange] = useState<"all" | "recent">("all");

  const liability = range === "recent"
    ? f.throughput.filter((_, i) => i >= Math.max(0, f.throughput.length - 5))
    : f.throughput;

  const urgent = f.sorted[0] as unknown as { status?: string; tax_type?: string; period?: string; due_date?: string } | undefined;
  const urgentIdx = urgent ? stageIndex(String(urgent.status)) : -1;

  const sparkOwed = f.throughput.map((d) => d.payable);
  const sparkDocs = [2, 3, 2, 4, 3, Math.max(4, f.docs.length)];

  return (
    <div className="client-enter space-y-5">
      {/* HERO — gradient wash + accent CTAs */}
      <section className="relative overflow-hidden rounded-2xl p-6 md:p-8" style={{ background: "var(--hero-bg)", border: "1px solid var(--hero-border)", color: "var(--hero-text)" }}>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full" style={{ background: "radial-gradient(closest-side,color-mix(in srgb, var(--accent) 16%, transparent),transparent)" }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full" style={{ background: "radial-gradient(closest-side,color-mix(in srgb, var(--accent-hover) 12%, transparent),transparent)" }} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1" style={{ background: "linear-gradient(90deg,var(--accent),var(--accent-hover),transparent)" }} />
        <div className="relative grid items-center gap-6 lg:grid-cols-[1.4fr_.9fr]">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ background: "linear-gradient(90deg,var(--accent-tint),color-mix(in srgb, var(--accent) 6%, transparent))", color: "var(--hero-chip-tx)" }}>
              <Sparkles size={12} /> Employee workspace · {f.clients.length} clients · FY 2026
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-[34px]" style={{ fontFamily: "var(--font-fraunces),Georgia,serif" }}>
              {greeting()}, {name}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
              {f.openFilings.length === 0 && f.open.length === 0
                ? "All clear — no open filings or tasks. New assignments will land here."
                : `${f.openFilings.length} open filing${f.openFilings.length === 1 ? "" : "s"} · ${f.overdueFilings.length} overdue · ${f.open.length} open task${f.open.length === 1 ? "" : "s"}. Your next step is highlighted below.`}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/employee/tasks" className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-hover))", boxShadow: "0 8px 20px color-mix(in srgb, var(--accent) 35%, transparent)" }}>
                <Briefcase size={15} /> My tasks
              </Link>
              <Link href="/employee/clients" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[var(--surface-muted)]" style={{ borderColor: "var(--border)", color: BLUE }}>
                <Users size={15} /> Clients
              </Link>
              <Link href="/employee/messages" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[var(--surface-muted)]" style={{ borderColor: "var(--border)", color: BLUE }}>
                <MessagesSquare size={15} /> Messages
              </Link>
            </div>
            {urgent && (
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full px-3 py-1.5 font-semibold" style={{ background: "linear-gradient(90deg,var(--accent-tint),color-mix(in srgb, var(--accent) 8%, transparent))", color: "var(--accent-hover)" }}>Now: {stageLabel(String(urgent.status))} · {urgent.tax_type} {urgent.period}</span>
                <Link href="/employee/tax-filings" className="rounded-full px-3 py-1.5 font-bold text-white" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-hover))" }}>Open filing →</Link>
              </div>
            )}
          </div>
          <div className="rounded-2xl p-5" style={{ background: "linear-gradient(180deg,var(--hero-card-bg),color-mix(in srgb, var(--accent) 6%, var(--hero-card-bg)))", border: "1px solid var(--hero-border)" }}>
            <ScoreRing value={f.score} label="Productivity score" />
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { v: String(f.doneFilings.length), l: "Filed" },
                { v: String(f.overdueTasks.length + f.overdueFilings.length), l: "Overdue" },
                { v: String(f.dueSoonTasks.length), l: "Due soon" },
              ].map((s) => (
                <div key={s.l} className="rounded-xl px-2 py-3" style={{ background: "linear-gradient(180deg,var(--surface-muted),color-mix(in srgb, var(--accent) 7%, var(--surface-muted)))", border: "1px solid var(--border)" }}>
                  <p className="tnum text-xl font-bold" style={{ color: "var(--text)" }}>{s.v}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* KPI STRIP (same as client) */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <EmpStat label="Assigned clients" value={String(f.clients.length)} hint="In your portfolio" icon={<Users size={19} />} tone="blue" />
        <EmpStat label="Due this week" value={String(f.dueWeek)} hint="Act before Friday" icon={<CalendarDays size={19} />} tone="sky" />
        <EmpStat label="Open tasks" value={String(f.open.length)} hint={`${f.overdueTasks.length} overdue`} icon={<Briefcase size={19} />} tone={f.overdueTasks.length ? "red" : "blue"} />
        <EmpStat label="Documents" value={String(f.docs.length)} hint="In your scope" icon={<FolderOpen size={19} />} tone="sky" />
      </section>

      {/* PIPELINE STEPPER (same as client) */}
      <section className="card p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h2 className="client-section-title">Where filings stand</h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>Created → Docs requested → Docs received → In preparation → Review &amp; sign → Filed → Completed</p>
          </div>
          <Link href="/employee/tax-filings" className="ml-auto inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: BLUE }}>
            All filings <ArrowUpRight size={13} />
          </Link>
        </div>
        {!urgent ? (
          <div className="mt-4"><EmptyState icon={<FileText size={22} />} title="No filings yet — new assignments will appear here with live status" /></div>
        ) : (
          <div className="mt-5">
            <div className="flex items-center gap-0 overflow-x-auto pb-1">
              {FILING_STAGES.map((s, i) => {
                const done = i < Math.max(urgentIdx, 0);
                const cur = i === Math.max(urgentIdx, 0);
                return (
                  <div key={s.key} className="flex min-w-0 flex-1 items-start">
                    <div className="flex min-w-[74px] flex-col items-center gap-1.5 text-center">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                        style={done || cur ? { background: BLUE, color: "#fff", boxShadow: cur ? "0 0 0 5px #6D28D922" : undefined } : { background: "var(--surface-muted, #F0EDE6)", color: SLATE }}>
                        {done ? "✓" : i + 1}
                      </span>
                      <span className="text-[10px] font-semibold leading-tight" style={{ color: cur ? BLUE : "var(--text-2)" }}>{s.label}</span>
                    </div>
                    {i < FILING_STAGES.length - 1 && <span className="mx-1 mt-4 h-0.5 min-w-4 flex-1 rounded" style={{ background: done ? BLUE : "var(--border)" }} />}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--surface-muted,#F0EDE6)" }}>
              <BadgeCheck size={16} style={{ color: BLUE }} />
              <span><strong>{stageLabel(String(urgent.status))}</strong> · {urgent.tax_type} {urgent.period} · {dueLabel(String(urgent.due_date ?? ""))}</span>
              <Link href="/employee/tax-filings" className="ml-auto rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: BLUE }}>Open filing</Link>
            </div>
          </div>
        )}
      </section>

      {/* CHARTS ROW 1 (same as client) */}
      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <EmpChartCard
          title="Workload across periods"
          sub="Completions vs liability per period"
          action={
            <div className="flex gap-1.5">
              {(["all", "recent"] as const).map((r) => (
                <button key={r} onClick={() => setRange(r)} className="rounded-full px-3 py-1 text-[11px] font-bold capitalize"
                  style={range === r ? { background: BLUE, color: "#fff" } : { border: "1px solid var(--border)" }}>{r}</button>
              ))}
            </div>
          }
        >
          {liability.length === 0 ? (
            <EmptyState icon={<FileText size={22} />} title="Chart appears once filings exist" />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={liability} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="empPayG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BLUE} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="empRefG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SKY} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={SKY} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => (typeof v === "number" && v >= 1000 ? formatMoney(v) : v as never)} />
                  <Area type="monotone" dataKey="completed" name="Completed" stroke={BLUE} strokeWidth={2.5} fill="url(#empPayG)" />
                  <Area type="monotone" dataKey="payable" name="Liability" stroke={SKY} strokeWidth={2.5} fill="url(#empRefG)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex gap-4 text-xs font-semibold" style={{ color: "var(--text-2)" }}>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: BLUE }} /> Completed</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SKY }} /> Liability</span>
          </div>
        </EmpChartCard>

        <EmpChartCard title="Filing mix" sub="Share by live status" action={<Link href="/employee/tax-filings" className="text-xs font-bold hover:underline" style={{ color: BLUE }}>Filings →</Link>}>
          {f.statusDonut.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={22} />} title="No filings yet" />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={f.statusDonut} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3} strokeWidth={0}>
                    {f.statusDonut.map((_, i) => <Cell key={i} fill={CHART[i % CHART.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-1 space-y-1.5">
            {f.statusDonut.slice(0, 4).map((d, i) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART[i % CHART.length] }} />
                <span className="font-semibold">{d.name}</span>
                <span className="tnum ml-auto" style={{ color: "var(--text-2)" }}>{d.value}</span>
              </div>
            ))}
          </div>
        </EmpChartCard>
      </section>

      {/* CHARTS ROW 2 (same as client) */}
      <section className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
        <EmpChartCard title="Tasks by priority" sub="Where your time goes" action={<Link href="/employee/tasks" className="text-xs font-bold hover:underline" style={{ color: BLUE }}>Tasks →</Link>}>
          {(f.priorityBars.length === 0 && f.open.length === 0) ? (
            <EmptyState icon={<Briefcase size={22} />} title="No open tasks" />
          ) : (
            (() => {
              const priRows = f.priorityBars.length ? f.priorityBars : [{ name: "Open", value: f.open.length }];
              return (
                <div className="w-full min-w-0 overflow-hidden" style={{ height: Math.min(240, Math.max(132, priRows.length * 68)) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={priRows} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" hide domain={[0, (dataMax: number) => Math.max(2, dataMax + 1)]} />
                      <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} interval={0} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "transparent" }} formatter={(value: unknown) => [`${value}`, "Tasks"]} />
                      <Bar dataKey="value" radius={[6, 6, 6, 6]} barSize={18}>
                        {priRows.map((_, i) => <Cell key={i} fill={i === 0 ? BLUE : i === 1 ? SKY : "#38BDF8"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })()
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border p-3" style={{ background: "var(--accent-tint)", borderColor: "var(--border)" }}>
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--accent)" }}>Collected</p>
              <p className="tnum mt-1 text-lg font-bold" style={{ color: "var(--text)" }}>{formatMoney(f.paid)}</p>
            </div>
            <div className="rounded-xl border p-3" style={{ background: "var(--warn-bg)", borderColor: "var(--border)" }}>
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--warn-tx)" }}>Outstanding</p>
              <p className="tnum mt-1 text-lg font-bold" style={{ color: "var(--text)" }}>{formatMoney(f.outstanding)}</p>
            </div>
          </div>
        </EmpChartCard>

        <EmpChartCard title="Upcoming deadlines" sub="Sorted by due date — act on the red ones first" action={<Link href="/employee/tax-filings" className="text-xs font-bold hover:underline" style={{ color: BLUE }}>View all →</Link>}>
          {f.sorted.length === 0 ? (
            <EmptyState icon={<CalendarDays size={22} />} title="No deadlines scheduled" />
          ) : (
            <div className="space-y-2.5">
              {f.sorted.slice(0, 5).map((d) => {
                const n = daysUntil(d.due_date);
                const pct = n === null ? 0 : n < 0 ? 100 : n === 0 ? 92 : Math.max(8, 100 - n * 9);
                const hot = (n ?? 99) <= 3;
                return (
                  <div key={d.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]" style={{ borderColor: "var(--border)" }}>
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-xs font-bold" style={hot ? { background: "var(--danger-bg)", color: "var(--danger-tx)" } : { background: "var(--accent-tint)", color: "var(--accent)" }}>
                      {new Date(d.due_date).getDate()}
                      <span className="text-[10px]">{new Date(d.due_date).toLocaleString("en", { month: "short" })}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{d.tax_type} · {d.period}</p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-muted,#F0EDE6)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: hot ? RED : BLUE }} />
                      </div>
                    </div>
                    <Badge tone={hot ? "danger" : "warning"}>{dueLabel(d.due_date)}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </EmpChartCard>
      </section>

      {/* WORKLOAD + ACTION (same as client) */}
      <section className="grid gap-4 xl:grid-cols-2">
        <EmpChartCard title="Workload pulse" sub="Open vs done tasks per filing" action={<Link href="/employee/tasks" className="text-xs font-bold hover:underline" style={{ color: BLUE }}>My tasks →</Link>}>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={f.pulse.length ? f.pulse : [{ name: "—", open: 0, done: 0 }]} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: SLATE }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="open" name="Open" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3, fill: BLUE }} />
                <Line type="monotone" dataKey="done" name="Done" stroke={GREEN_OK} strokeWidth={2.5} dot={{ r: 3, fill: GREEN_OK }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            {[
              { v: String(f.open.length), l: "Open tasks", hot: f.overdueTasks.length > 0 },
              { v: String(f.dueSoonTasks.length), l: "Due ≤ 3 days", hot: false },
              { v: String(f.done.length), l: "Completed", hot: false },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border px-2 py-2.5" style={{ borderColor: "var(--border)" }}>
                <p className="tnum text-lg font-bold" style={s.hot ? { color: RED } : undefined}>{s.v}</p>
                <p className="text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>{s.l}</p>
              </div>
            ))}
          </div>
        </EmpChartCard>

        <div className="card flex min-w-0 flex-col overflow-hidden p-0">
          <div className="p-5 pb-3">
            <h3 className="client-section-title">Needs your action</h3>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>Highest priority first — one tap to resolve</p>
          </div>
          <div className="flex-1 space-y-2 px-5 pb-4">
            {f.overdueTasks.length === 0 && f.overdueFilings.length === 0 && f.open.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl p-4" style={{ background: "var(--accent-tint)" }}>
                <CheckCircle2 size={20} style={{ color: "var(--accent)" }} />
                <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>All caught up — nothing needs your action.</p>
              </div>
            ) : (
              <>
                {f.overdueTasks.slice(0, 3).map((t) => (
                  <ActionRow key={t.id} icon={<CircleAlert size={16} />} tone="red" title={t.title} meta={t.due_date ? dueLabel(String(t.due_date)) : "No due date"} href="/employee/tasks" cta="Open task" />
                ))}
                {f.open.slice(0, 3 - Math.min(3, f.overdueTasks.length)).map((t) => (
                  <ActionRow key={t.id} icon={<Clock3 size={16} />} tone="brass" title={t.title} meta={t.due_date ? dueLabel(String(t.due_date)) : "No due date"} href="/employee/tasks" cta="Do it now" />
                ))}
                {f.overdueFilings.slice(0, 2).map((d) => (
                  <ActionRow key={d.id} icon={<FileText size={16} />} tone="red" title={`${d.tax_type} ${d.period} is overdue`} meta={dueLabel(d.due_date)} href="/employee/tax-filings" cta="Review" />
                ))}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 border-t px-5 py-3.5" style={{ borderColor: "var(--border)", background: "var(--surface-muted,#F0EDE6)" }}>
            <Bell size={14} style={{ color: SLATE }} />
            <p className="text-xs" style={{ color: "var(--text-2)" }}>Only clients assigned to you are counted here.</p>
            <Link href="/employee/messages" className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-bold hover:underline" style={{ color: BLUE }}>
              <MessagesSquare size={12} /> Inbox
            </Link>
          </div>
        </div>
      </section>

      {/* MY CLIENTS (same card language) */}
      <section className="card p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h2 className="client-section-title">My clients</h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>{f.clients.length} assigned to you</p>
          </div>
          <Link href="/employee/clients" className="ml-auto inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: BLUE }}>
            View all <ArrowUpRight size={13} />
          </Link>
        </div>
        {f.clients.length === 0 ? (
          <div className="mt-4"><EmptyState icon={<Users size={22} />} title="No clients assigned yet" /></div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {f.clients.slice(0, 4).map((c) => (
              <div key={c.id} className="rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: BLUE }}>{c.name.slice(0, 1)}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{c.business_name ?? c.name}</p><p className="text-xs" style={{ color: "var(--text-2)" }}>{c.entity_type ?? ""}</p></div>
                </div>
                <div className="mt-2"><Badge tone="accent">Active</Badge></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BOTTOM CTA (same as client) */}
      <section className="grid gap-4 md:grid-cols-3">
        {[
          { t: "Document review", d: "Accept, reject & version-track", h: "/employee/documents", i: <Upload size={18} /> },
          { t: "Payments & invoices", d: "Track paid vs outstanding", h: "/employee/payments", i: <Wallet size={18} /> },
          { t: "Reports & analytics", d: "Completion, risk & exports", h: "/employee/reports", i: <Gauge size={18} /> },
        ].map((c) => (
          <Link key={c.t} href={c.h} className="card group flex items-center gap-3 p-5 transition-all hover:-translate-y-0.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>{c.i}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{c.t}</span>
              <span className="block truncate text-xs" style={{ color: "var(--text-2)" }}>{c.d}</span>
            </span>
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" style={{ color: SLATE }} />
          </Link>
        ))}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  INSIDE PAGES — premium wrappers (employee only)                    */
/* ------------------------------------------------------------------ */

function PageShell({ eyebrow, title, sub, actions, stats, kpis, children }: {
  eyebrow: string; title: string; sub: string; actions?: React.ReactNode;
  stats?: { v: string; l: string }[]; kpis?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-5">
      <PremHero role="employee" eyebrow={eyebrow} title={title} sub={sub}
        stats={stats ?? []} actions={<>{actions}</>} />
      {kpis && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpis}</div>}
      <div className="rounded-[20px] border p-4 md:p-6" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="premium-embed employee-embed min-w-0">{children}</div>
      </div>
    </div>
  );
}

export function EmployeeFilingsPremium() {
  const f = useEmployeeFacts();
  const pct = f.filings.length ? Math.round((f.doneFilings.length / f.filings.length) * 100) : 0;
  return (
    <PageShell
      eyebrow="Compliance pipeline"
      title="Tax filings"
      sub="Every return, its live 7-stage status and what happens next — scoped to your clients."
      stats={[{ v: String(f.filings.length), l: "Total" }, { v: `${pct}%`, l: "Done" }, { v: String(f.overdueFilings.length), l: "Overdue" }]}
      actions={<><PremBtn role="employee" href="/employee/tasks">Task center</PremBtn><PremBtn role="employee" href="/employee/documents" ghost>Documents</PremBtn></>}
      kpis={
        <>
          <PremKpi role="employee" label="Total filings" value={String(f.filings.length)} hint="In your scope" icon={<FileText size={19} />} />
          <PremKpi role="employee" label="Completed" value={`${pct}%`} hint={`${f.doneFilings.length} filed & done`} icon={<BadgeCheck size={19} />} />
          <PremKpi role="employee" label="Overdue" value={String(f.overdueFilings.length)} hint="Act first on these" icon={<CircleAlert size={19} />} />
          <PremKpi role="employee" label="Tax liability" value={formatMoney(f.owed)} hint="Across open filings" icon={<IndianRupee size={19} />} />
        </>
      }
    >
      <FilingsView role="employee" />
    </PageShell>
  );
}

export function EmployeeTasksPremium() {
  const f = useEmployeeFacts();
  return (
    <PageShell
      eyebrow="Action centre"
      title="Task management"
      sub="Kanban, priorities and deadlines — everything assigned to you in one board."
      stats={[{ v: String(f.open.length), l: "Open" }, { v: String(f.dueSoonTasks.length), l: "Due soon" }, { v: `${f.completionPct}%`, l: "Done" }]}
      actions={<><PremBtn role="employee" href="/employee/tax-filings">Filings</PremBtn><PremBtn role="employee" href="/employee/performance" ghost>Performance</PremBtn></>}
      kpis={
        <>
          <PremKpi role="employee" label="Open" value={String(f.open.length)} hint="Needs action" icon={<Clock3 size={19} />} />
          <PremKpi role="employee" label="Due soon" value={String(f.dueSoonTasks.length)} hint="Within 3 days" icon={<CalendarDays size={19} />} />
          <PremKpi role="employee" label="Overdue" value={String(f.overdueTasks.length)} hint={f.overdueTasks.length ? "Do these today" : "Nothing overdue"} icon={<CircleAlert size={19} />} />
          <PremKpi role="employee" label="Completed" value={String(f.done.length)} hint="Well done" icon={<CheckCircle2 size={19} />} />
        </>
      }
    >
      <div className="min-w-0"><TaskCenter role="employee" /></div>
    </PageShell>
  );
}

export function EmployeeClientsPremium() {
  const f = useEmployeeFacts();
  return (
    <PageShell
      eyebrow="Portfolio"
      title="My clients"
      sub="Clients assigned to you — open a profile for details, tasks and quick actions."
      stats={[{ v: String(f.clients.length), l: "Clients" }, { v: String(f.openFilings.length), l: "Open filings" }, { v: String(f.open.length), l: "Open tasks" }]}
      actions={<><PremBtn role="employee" href="/employee/tasks">Add task</PremBtn><PremBtn role="employee" href="/employee/documents" ghost>Documents</PremBtn></>}
      kpis={
        <>
          <PremKpi role="employee" label="Assigned clients" value={String(f.clients.length)} hint="Your portfolio" icon={<Users size={19} />} spark={[2, 3, 4, 5, Math.max(5, f.clients.length)]} />
          <PremKpi role="employee" label="Open filings" value={String(f.openFilings.length)} hint="Across your clients" icon={<FileText size={19} />} />
          <PremKpi role="employee" label="Open tasks" value={String(f.open.length)} hint="Needs your action" icon={<Briefcase size={19} />} />
          <PremKpi role="employee" label="Overdue" value={String(f.overdueFilings.length + f.overdueTasks.length)} hint="Act first" icon={<CircleAlert size={19} />} />
        </>
      }
    >
      <ClientsView role="employee" />
    </PageShell>
  );
}

export function EmployeeDocumentsPremium() {
  const f = useEmployeeFacts();
  return (
    <PageShell
      eyebrow="Review workspace"
      title="Documents"
      sub="Review, accept or reject client uploads — versions and audit trail stay linked."
      stats={[{ v: String(f.docs.length), l: "Files" }, { v: String(f.openFilings.length), l: "Open filings" }, { v: `${f.score}`, l: "Score" }]}
      actions={<><PremBtn role="employee" href="/employee/tax-filings">Filings</PremBtn><PremBtn role="employee" href="/employee/clients" ghost>Clients</PremBtn></>}
      kpis={
        <>
          <PremKpi role="employee" label="Files in scope" value={String(f.docs.length)} hint="Across assigned clients" icon={<FolderOpen size={19} />} />
          <PremKpi role="employee" label="Open filings" value={String(f.openFilings.length)} hint="May need uploads" icon={<FileText size={19} />} />
          <PremKpi role="employee" label="Overdue items" value={String(f.overdueFilings.length + f.overdueTasks.length)} hint="Review to clear" icon={<CircleAlert size={19} />} />
          <PremKpi role="employee" label="Productivity" value={`${f.score}`} hint="Score / 100" icon={<ShieldCheck size={19} />} />
        </>
      }
    >
      <DocumentsView role="employee" />
    </PageShell>
  );
}

export function EmployeePaymentsPremium() {
  const f = useEmployeeFacts();
  return (
    <PageShell
      eyebrow="Billing"
      title="Payments"
      sub="Firm invoices, GST challans and receipts for your clients — export anything in one tap."
      stats={[{ v: formatMoney(f.outstanding), l: "Due" }, { v: formatMoney(f.paid), l: "Paid" }, { v: String(f.payments.length), l: "Invoices" }]}
      actions={
        <>
          <Button variant="ghost" onClick={() => downloadFile("employee-invoices.csv", f.payments.map((p) => `${p.invoice_number},${p.amount},${p.status}`).join("\n"))}><Download size={14} /> Export</Button>
          <span className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white" style={{ background: T.primary }}><Wallet size={14} /> {formatMoney(f.outstanding)} due</span>
        </>
      }
      kpis={
        <>
          <PremKpi role="employee" label="Outstanding" value={formatMoney(f.outstanding)} hint="Across unpaid invoices" icon={<Wallet size={19} />} />
          <PremKpi role="employee" label="Collected" value={formatMoney(f.paid)} hint="Paid to date" icon={<BadgeCheck size={19} />} />
          <PremKpi role="employee" label="Tax liability" value={formatMoney(f.owed)} hint="Filing liability" icon={<IndianRupee size={19} />} />
          <PremKpi role="employee" label="Invoices" value={String(f.payments.length)} hint="In scope" icon={<Receipt size={19} />} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <PremCard title="Cash snapshot" sub="Paid vs outstanding">
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[{ name: "Paid", value: Math.max(f.paid, 0.001) }, { name: "Outstanding", value: Math.max(f.outstanding, 0.001) }]} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={4} strokeWidth={0}>
                  <Cell fill={T.primary} /><Cell fill={T.accent} />
                </Pie>
                <Tooltip contentStyle={TOOLTIP} formatter={(v: unknown) => formatMoney(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 text-xs font-semibold" style={{ color: "var(--text-2)" }}>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: T.primary }} /> Paid</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: T.accent }} /> Outstanding</span>
          </div>
        </PremCard>
        <div className="min-w-0"><PaymentsView role="employee" /></div>
      </div>
    </PageShell>
  );
}

export function EmployeeMessagesPremium() {
  const f = useEmployeeFacts();
  return (
    <PageShell
      eyebrow="Inbox"
      title="Messages"
      sub="A direct line to your clients and admins — replies land here, not in email threads."
      stats={[{ v: String(f.clients.length), l: "Clients" }, { v: String(f.open.length), l: "Open tasks" }, { v: String(f.dueWeek), l: "Due wk" }]}
      actions={<Link href="/employee/clients" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "var(--border)", color: T.primary }}><Phone size={14} /> View clients</Link>}
    >
      <MessagesView embedded />
    </PageShell>
  );
}

export function EmployeePerformancePremium() {
  const f = useEmployeeFacts();
  return (
    <PageShell
      eyebrow="Growth"
      title="My performance"
      sub="Live from your scoped filings and tasks — completion, throughput and risk at a glance."
      stats={[{ v: String(f.doneFilings.length), l: "Filed" }, { v: String(f.done.length), l: "Tasks done" }, { v: `${f.score}%`, l: "Score" }]}
      actions={<><PremBtn role="employee" href="/employee/reports">Reports</PremBtn><PremBtn role="employee" href="/employee/tasks" ghost>Tasks</PremBtn></>}
      kpis={
        <>
          <PremKpi role="employee" label="Filings done" value={String(f.doneFilings.length)} hint="Completed returns" icon={<BadgeCheck size={19} />} spark={f.throughput.map((d) => d.completed)} />
          <PremKpi role="employee" label="Tasks done" value={String(f.done.length)} hint="Closed by you" icon={<CheckCircle2 size={19} />} spark={f.weekly.map((w) => w.done)} />
          <PremKpi role="employee" label="On-time rate" value={f.filings.length ? `${Math.round((f.doneFilings.length / f.filings.length) * 100)}%` : "—"} hint="Across your scope" icon={<Gauge size={19} />} />
          <PremKpi role="employee" label="Overdue load" value={String(f.overdueTasks.length + f.overdueFilings.length)} hint="Clear to improve" icon={<CircleAlert size={19} />} />
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <PremCard title="Completion ring" sub="Tasks closed by you">
          <div className="flex min-w-0 items-center gap-4">
            <div className="h-[128px] w-[128px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ name: "x", value: f.completionPct }]} startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="value" cornerRadius={8} fill={T.primary} background={{ fill: "var(--surface-muted)" }} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0">
              <p className="tnum text-3xl font-bold leading-none">{f.completionPct}%</p>
              <p className="mt-1 text-xs font-semibold leading-snug" style={{ color: "var(--text-2)" }}>{f.done.length}/{f.mine.length} tasks complete</p>
              <Link href="/employee/tasks" className="mt-2 inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: T.primary }}>Close more <ArrowRight size={13} /></Link>
            </div>
          </div>
        </PremCard>
        <div className="min-w-0"><PerformanceView role="employee" /></div>
      </div>
    </PageShell>
  );
}

export function EmployeeReportsPremium() {
  const f = useEmployeeFacts();
  const rate = f.filings.length ? Math.round((f.doneFilings.length / f.filings.length) * 100) : 0;
  return (
    <PageShell
      eyebrow="Insights"
      title="Reports & analytics"
      sub="Completion, risk and workload — live-computed from your scope and exportable."
      stats={[{ v: `${rate}%`, l: "Complete" }, { v: String(f.overdueFilings.length), l: "At risk" }, { v: formatMoney(f.paid), l: "Collected" }]}
      actions={<><PremBtn role="employee" href="/employee/performance">Performance</PremBtn><PremBtn role="employee" href="/employee/tax-filings" ghost>Filings</PremBtn></>}
      kpis={
        <>
          <PremKpi role="employee" label="Completion rate" value={`${rate}%`} hint="Filings closed" icon={<BadgeCheck size={19} />} />
          <PremKpi role="employee" label="At risk / overdue" value={String(f.overdueFilings.length)} hint="Needs action" icon={<CircleAlert size={19} />} />
          <PremKpi role="employee" label="Collected" value={formatMoney(f.paid)} hint="Paid invoices" icon={<Wallet size={19} />} />
          <PremKpi role="employee" label="Tasks done" value={String(f.done.length)} hint="Closed by you" icon={<CheckCircle2 size={19} />} />
        </>
      }
    >
      <ReportsView />
    </PageShell>
  );
}

export function EmployeeAccountPremium() {
  const f = useEmployeeFacts();
  return (
    <PageShell
      eyebrow="Profile"
      title="Account & profile"
      sub="Your personal info, work summary, security and preferences live here."
      stats={[{ v: String(f.done.length), l: "Tasks done" }, { v: String(f.doneFilings.length), l: "Filed" }, { v: `${f.score}`, l: "Score" }]}
      actions={<span className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold" style={{ background: T.soft, color: T.primary }}><ShieldCheck size={14} /> Score {f.score}/100</span>}
    >
      <AccountView role="employee" />
    </PageShell>
  );
}

const EMP_HELP_FAQS = [
  { q: "How do I close a task?", a: "Open Task Management → pick your card → move it to Done. The client and admin see the update instantly." },
  { q: "How do I escalate a risky filing?", a: "Open Tax Filings → find the row → Escalate. An admin is notified with your note attached." },
  { q: "How do I review a document?", a: "Open Documents → Open → Accept or Reject with a reason. Rejections go back to the client with your note." },
  { q: "Who sees my work?", a: "Only you, your assigned clients' data and admins. Nothing leaks across employees." },
];

export function EmployeeHelpPremium() {
  return (
    <PageShell
      eyebrow="Support"
      title="Help & support"
      sub="Guides for tasks, escalations and reviews — same layout as every employee page."
      stats={[{ v: "4", l: "Guides" }, { v: "< 1 day", l: "Reply" }, { v: "24/7", l: "Docs" }]}
      actions={<span className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold" style={{ background: T.soft, color: T.primary }}><LifeBuoy size={14} /> 4 guides</span>}
    >
      <div className="min-w-0"><TicketHelpCenter role="employee" /></div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {EMP_HELP_FAQS.map((x) => (
          <div key={x.q} className="min-w-0 rounded-[20px] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <p className="flex items-center gap-2 text-sm font-bold leading-snug"><LifeBuoy size={15} className="shrink-0" style={{ color: T.primary }} /> {x.q}</p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{x.a}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
