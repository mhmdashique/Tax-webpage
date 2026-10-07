"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from "recharts";
import { Users, CalendarDays, CheckCircle2, Briefcase, ArrowUpRight, Clock3, Inbox } from "lucide-react";
import { Badge, EmptyState } from "./ui";
import { useFilings, useTasks, useClients, useCurrentUser } from "@/lib/hooks";
import { dueLabel, greeting } from "@/lib/data";
import { isComplete, isOverdue, stageLabel } from "@/lib/lifecycle";
import { PREMIUM, TOOLTIP, PremHero, PremKpi, PremCard, PremBtn } from "./premium-theme";

const T = PREMIUM.employee;

export function EmployeeDashboardPremium() {
  const { data: me } = useCurrentUser();
  const { data: filings = [], isLoading } = useFilings();
  const { data: clients = [] } = useClients();
  const { data: tasks = [] } = useTasks();
  const name = me?.name ?? "there";

  const mine = useMemo(() => tasks.filter((t) => !me?.id || !t.assigned_to || t.assigned_to === (me as { id?: string })?.id), [tasks, me]);
  const open = mine.filter((t) => !["done", "cancelled"].includes(String(t.status)));
  const done = mine.filter((t) => String(t.status) === "done").length;
  const dueWeek = filings.filter((f) => { const d = new Date(f.due_date).getTime() - Date.now(); return d >= 0 && d < 7 * 864e5; }).length;
  const overdue = filings.filter((f) => isOverdue(String(f.status), f.due_date)).length;
  const sorted = [...filings].sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date)).slice(0, 6);

  const pulse = useMemo(() => [...filings].slice(0, 6).map((f, i) => ({
    name: (f.period ?? `F${i + 1}`).slice(0, 8),
    open: mine.filter((t) => t.related_filing_id === f.id && !["done", "cancelled"].includes(String(t.status))).length,
    done: mine.filter((t) => t.related_filing_id === f.id && String(t.status) === "done").length,
  })), [filings, mine]);

  const workload = useMemo(() => [
    { name: "Open", value: open.length },
    { name: "Done", value: done },
    { name: "Overdue", value: mine.filter((t) => !["done", "cancelled"].includes(String(t.status)) && !!t.due_date && t.due_date < new Date().toISOString().slice(0, 10)).length },
  ], [open.length, done, mine]);

  return (
    <div className="prem-enter space-y-5">
      <PremHero role="employee" eyebrow="My workspace" title={`${greeting()}, ${name}`}
        sub={`${clients.length} clients · ${dueWeek} filings due this week · ${open.length} open tasks`}
        stats={[{ v: String(clients.length), l: "Clients" }, { v: String(dueWeek), l: "Due wk" }, { v: String(done), l: "Done" }]}
        actions={<><PremBtn role="employee" href="/employee/tasks">My tasks</PremBtn><PremBtn role="employee" href="/employee/clients" ghost>Clients</PremBtn></>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PremKpi role="employee" label="My clients" value={String(clients.length)} hint="Assigned to you" icon={<Users size={19} />} spark={[2, 3, 4, 5, Math.max(5, clients.length)]} />
        <PremKpi role="employee" label="Due this week" value={String(dueWeek)} hint="Act before Friday" icon={<CalendarDays size={19} />} />
        <PremKpi role="employee" label="Open tasks" value={String(open.length)} hint={`${overdue} overdue filings`} icon={<Briefcase size={19} />} />
        <PremKpi role="employee" label="Completed" value={String(filings.filter((f) => isComplete(String(f.status))).length)} hint="Filings done" icon={<CheckCircle2 size={19} />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <PremCard title="Workload pulse" sub="Open vs done tasks per filing" action={<Link href="/employee/tasks" className="inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: T.primary }}>Task center <ArrowUpRight size={13} /></Link>}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pulse.length ? pulse : [{ name: "—", open: 0, done: 0 }]} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Line type="monotone" dataKey="open" name="Open" stroke={T.primary} strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="done" name="Done" stroke={T.accent} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </PremCard>
        <PremCard title="Task split" sub="Where your time goes">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workload} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="value" radius={[6, 6, 6, 6]} barSize={20}>
                  {workload.map((_, i) => <Cell key={i} fill={T.chart[i % T.chart.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PremCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PremCard title="My clients" sub={`${clients.length} assigned`} action={<Link href="/employee/clients" className="text-xs font-bold hover:underline" style={{ color: T.primary }}>View all →</Link>}>
          {clients.length === 0 ? <EmptyState icon={<Users size={22} />} title="No clients assigned yet" /> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {clients.slice(0, 4).map((c) => (
                <div key={c.id} className="rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: T.primary }}>{c.name.slice(0, 1)}</span>
                    <div className="min-w-0"><p className="truncate text-sm font-bold">{c.business_name ?? c.name}</p><p className="text-xs" style={{ color: "var(--text-2)" }}>{c.entity_type ?? ""}</p></div>
                  </div>
                  <div className="mt-2"><Badge tone="accent">Active</Badge></div>
                </div>
              ))}
            </div>
          )}
        </PremCard>
        <PremCard title="Deadline tracker" sub="Sorted by due date" action={<Link href="/employee/tax-filings" className="text-xs font-bold hover:underline" style={{ color: T.primary }}>Filings →</Link>}>
          {isLoading ? <div className="skeleton h-32" /> : sorted.length === 0 ? <EmptyState icon={<Inbox size={22} />} title="Nothing due — enjoy the calm" /> : (
            <div className="space-y-2">{sorted.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm">
                <Clock3 size={15} style={{ color: T.primary }} />
                <span className="font-bold">{f.tax_type}</span>
                <span className="text-xs" style={{ color: "var(--text-2)" }}>{stageLabel(String(f.status))}</span>
                <span className="ml-auto"><Badge tone={isOverdue(String(f.status), f.due_date) ? "danger" : "warning"}>{dueLabel(f.due_date)}</Badge></span>
              </div>
            ))}</div>
          )}
        </PremCard>
      </div>
    </div>
  );
}
