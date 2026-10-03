"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Card, StatCard, StatusBadge, EmptyState, Badge, Modal, Button, Sparkline, Stepper } from "@/components/ui";
import { useFilings, useTasks, useClients, usePayments, useActivity } from "@/lib/hooks";
import { dueLabel, greeting, formatMoney, toCSV, downloadFile } from "@/lib/data";
import { Users, FileClock, Receipt, CheckCircle2, Inbox, Plus } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

import { FILING_STAGES, normalizeStage, isComplete, isFiledOrLater, isOverdue } from "@/lib/lifecycle";
import { GstPaymentsPanel } from "@/components/gst-payments";
import { AddTaskButton, daysWaiting } from "@/components/task-center";
import { SearchSelect } from "@/components/search-select";
import { createClient } from "@/lib/supabase/client";

const STAGES = FILING_STAGES.map((s) => s.label);

export default function AdminDashboard() {
  const { data: filings = [], isLoading: fL } = useFilings();
  const { data: tasks = [], error: tasksError, mutate: mutateTasks } = useTasks();
  const { data: clients = [] } = useClients();
  const { data: payments = [] } = usePayments();
  const { data: activity = [] } = useActivity();
  const [scope, setScope] = useState<"mine" | "team">("team");
  const [newOpen, setNewOpen] = useState(false);
  const [taskActionMessage, setTaskActionMessage] = useState("");
  const [taskActionSaving, setTaskActionSaving] = useState("");
  const { data: employees = [], error: employeesError } = useSWR<{ id: string; name: string }[]>(
    "admin-dashboard-employees",
    async () => {
      const sb = createClient();
      if (!sb) throw new Error("Connect Supabase to load employee workload.");
      const { data, error } = await sb.from("users").select("id,name").eq("role", "employee").limit(200);
      if (error) throw error;
      return data ?? [];
    },
  );

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const dueThisMonth = filings.filter((f) => (f.due_date ?? "").slice(0, 7) === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`).length;
  const pendingVAT = filings.filter((f) => f.tax_type.toLowerCase().includes("vat") && !isFiledOrLater(String(f.status))).length;
  const quarterStart = Math.floor(now.getMonth() / 3) * 3;
  const doneQuarter = filings.filter((f) => isComplete(String(f.status)) && new Date(f.due_date).getMonth() >= quarterStart).length;
  const outstanding = useMemo(() => payments.filter((p) => p.status !== "paid").reduce((s, p) => s + Number(p.amount || 0), 0), [payments]);

  const sorted = [...filings].sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date)).slice(0, 8);
  const stageCounts: Record<string, number> = (() => {
    const m: Record<string, number> = Object.fromEntries(FILING_STAGES.map((s) => [s.key, 0]));
    let overdue = 0;
    for (const f of filings) {
      if (isOverdue(String(f.status), f.due_date)) { overdue++; continue; }
      const k = normalizeStage(String(f.status));
      if (k in m) m[k]++;
    }
    return { ...m, overdue };
  })();

  const trend = useMemo(() => {
    const out: { m: string; done: number; overdue: number }[] = [];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filings.length, monthKey]);

  const today = new Date().toISOString().slice(0, 10);
  const openTasksCount = tasks.filter((task) => !["done", "cancelled"].includes(String(task.status))).length;
  const overdueTasksCount = tasks.filter((task) => !["done", "cancelled"].includes(String(task.status)) && !!task.due_date && task.due_date < today).length;
  const dueTodayTasksCount = tasks.filter((task) => !["done", "cancelled"].includes(String(task.status)) && task.due_date === today).length;
  const waitingTasks = tasks.filter((task) => task.task_for === "client" && !["done", "cancelled"].includes(String(task.status)));
  const unassignedTasks = tasks.filter((task) => task.task_for !== "client" && !task.assigned_to && !["done", "cancelled"].includes(String(task.status)));
  const employeeWorkload = employees.map((employee) => {
    const assignedTasks = tasks.filter((task) => task.assigned_to === employee.id);
    return {
      ...employee,
      open: assignedTasks.filter((task) => !["done", "cancelled"].includes(String(task.status))).length,
      inProgress: assignedTasks.filter((task) => String(task.status) === "in_progress").length,
      overdue: assignedTasks.filter((task) => !["done", "cancelled"].includes(String(task.status)) && !!task.due_date && task.due_date < today).length,
      doneThisWeek: assignedTasks.filter((task) => {
        if (String(task.status) !== "done" || !task.completed_at) return false;
        const age = now.getTime() - new Date(task.completed_at).getTime();
        return age >= 0 && age < 7 * 864e5;
      }).length,
      clientCount: clients.filter((client) => client.assigned_employee_id === employee.id).length,
    };
  });

  async function assignDashboardTask(taskId: string, assigneeId: string) {
    const sb = createClient();
    if (!sb) { setTaskActionMessage("Connect Supabase before assigning a task."); return; }
    setTaskActionSaving(taskId);
    setTaskActionMessage("");
    const { error } = await sb.rpc("reassign_task", { p_task: taskId, p_assignee: assigneeId });
    setTaskActionSaving("");
    if (error) { setTaskActionMessage(error.message); return; }
    setTaskActionMessage("Task assigned.");
    await mutateTasks();
  }

  async function remindDashboardTask(taskId: string) {
    const sb = createClient();
    if (!sb) { setTaskActionMessage("Connect Supabase before sending a reminder."); return; }
    setTaskActionSaving(taskId);
    setTaskActionMessage("");
    const { error } = await sb.rpc("send_task_reminder", { p_task: taskId });
    setTaskActionSaving("");
    if (error) { setTaskActionMessage(error.message); return; }
    setTaskActionMessage("Reminder sent to the client.");
    await mutateTasks();
  }

  async function reassignFollowUp(taskId: string, ownerId: string) {
    const sb = createClient();
    if (!sb) { setTaskActionMessage("Connect Supabase before reassigning."); return; }
    setTaskActionSaving(taskId);
    setTaskActionMessage("");
    const { error } = await sb.rpc("reassign_task_follow_up", { p_task: taskId, p_owner: ownerId });
    setTaskActionSaving("");
    if (error) { setTaskActionMessage(error.message); return; }
    setTaskActionMessage("Follow-up owner reassigned.");
    await mutateTasks();
  }

  function exportCSV() {
    downloadFile("taxdesk-filings.csv", toCSV(filings as unknown as Record<string, unknown>[]));
  }

  return (
    <div className="space-y-6">
      {/* Header banner */}
      <div className="rounded-2xl p-6 text-white md:p-8" style={{ background: "linear-gradient(135deg,#2563EB,#1D4ED8)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold md:text-[28px]">{greeting()}, Admin</h1>
            <p className="mt-1 text-sm opacity-80">Apex Tax Advisors · {clients.length || "—"} active clients · firm-wide command center</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-full bg-white/20 p-1 text-sm font-semibold">
              {(["mine", "team"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)} className={`rounded-full px-4 py-1.5 ${scope === s ? "bg-white text-[#1D4ED8]" : "text-white"}`}>
                  {s === "mine" ? "My Clients" : "All Team"}
                </button>
              ))}
            </div>
            <button onClick={exportCSV} className="rounded-[10px] border border-white/40 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Export CSV</button>
            <button onClick={() => setNewOpen(true)} className="rounded-[10px] bg-white px-4 py-2.5 text-sm font-semibold text-[#1D4ED8]"><span className="mr-1">+</span> New</button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total active clients" value={String(clients.length || 0)} trend={clients.length ? "+4 this month" : undefined} icon={<Users size={18} />} spark={<Sparkline points={[4, 6, 5, 8, 9, 12]} />} />
        <StatCard label="Filings due this month" value={String(dueThisMonth)} icon={<FileClock size={18} />} spark={<Sparkline points={[2, 3, 5, 4, 6, dueThisMonth || 1]} />} />
        <StatCard label="Pending VAT filings" value={String(pendingVAT)} icon={<Receipt size={18} />} spark={<Sparkline points={[8, 6, 5, 4, 3, pendingVAT || 0]} color="#D97706" />} />
        <StatCard label="Completed this quarter" value={String(doneQuarter)} icon={<CheckCircle2 size={18} />} spark={<Sparkline points={[3, 5, 4, 7, 8, doneQuarter || 1]} color="#16A34A" />} />
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Task totals">
        <Badge tone="accent">{openTasksCount} open tasks</Badge>
        <Badge tone={overdueTasksCount ? "danger" : "neutral"}>{overdueTasksCount} overdue</Badge>
        <Badge tone="warning">{dueTodayTasksCount} due today</Badge>
        <Badge>{unassignedTasks.length} unassigned</Badge>
        <Badge>{waitingTasks.length} waiting on clients</Badge>
      </div>

      {outstanding > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm" style={{ background: "var(--warn-bg)", borderColor: "transparent" }}>
          <span className="font-semibold" style={{ color: "var(--warn-tx)" }}>Outstanding payments firm-wide: {formatMoney(outstanding)}</span>
          <Link href="/admin/payments" className="ml-auto font-semibold underline" style={{ color: "var(--warn-tx)" }}>View invoices</Link>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Deadline Tracker</h2>
            <Link href="/admin/tax-filings" className="text-sm font-semibold text-[#2563EB] hover:underline">View all</Link>
          </div>
          {fL ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-12" />)}</div>
          ) : sorted.length === 0 ? (
            <EmptyState icon={<Inbox size={22} />} title="No upcoming deadlines — create your first filing to get started" action={<Link href="/admin/tax-filings" className="btn-primary px-4 py-2 text-sm">New filing</Link>} />
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {sorted.map((f) => (
                <Link key={f.id} href="/admin/tax-filings" className="row-hover flex items-center gap-3 rounded-xl px-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{f.client_name ?? f.client_id.slice(0, 8)} · {f.tax_type}</p>
                    <p className="text-xs" style={{ color: "var(--text-2)" }}>{f.period} · due {f.due_date}</p>
                  </div>
                  <Badge tone={dueLabel(f.due_date).includes("overdue") ? "danger" : "warning"}>{dueLabel(f.due_date)}</Badge>
                  <StatusBadge status={String(f.status)} />
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card className="min-w-0 xl:col-span-5">
          <h2 className="mb-3 text-base font-semibold">Employee workload</h2>
          {employeesError && <p role="alert" className="text-sm text-[#DC2626]">Could not load employees: {employeesError.message}</p>}
          {tasksError && <p role="alert" className="text-sm text-[#DC2626]">Could not load tasks: {tasksError.message}</p>}
          <div className="space-y-2">
            {employeeWorkload.map((employee) => (
              <div key={employee.id} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" title={employee.name}>{employee.name}</p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
                    <span><strong className="font-semibold" style={{ color: "var(--text)" }}>{employee.open}</strong> open</span>
                    <span><strong className="font-semibold" style={{ color: "var(--text)" }}>{employee.inProgress}</strong> in progress</span>
                    {employee.overdue ? <Badge tone="danger">{employee.overdue} overdue</Badge> : <span><strong className="font-semibold" style={{ color: "var(--text)" }}>0</strong> overdue</span>}
                    <span><strong className="font-semibold" style={{ color: "var(--text)" }}>{employee.doneThisWeek}</strong> done</span>
                    <span><strong className="font-semibold" style={{ color: "var(--text)" }}>{employee.clientCount}</strong> clients</span>
                  </p>
                </div>
                <div className="shrink-0 [&_button]:whitespace-nowrap [&_button]:rounded-[10px] [&_button]:px-3 [&_button]:py-2 [&_button]:text-xs">
                  <AddTaskButton role="admin" preselectedAssigneeId={employee.id} label="Add task" />
                </div>
              </div>
            ))}
          </div>
          {!employeesError && !employeeWorkload.length && <EmptyState icon={<Users size={22} />} title="No employees found" />}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div><h2 className="font-semibold">Client tasks waiting</h2><p className="text-xs" style={{ color: "var(--text-2)" }}>{waitingTasks.length} open client tasks</p></div>
            <Link href="/admin/tasks" className="text-xs font-semibold text-[#2563EB] hover:underline">Task Center</Link>
          </div>
          <div className="space-y-2">
            {waitingTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-[150px] flex-1">
                  <p className="font-semibold">{task.title}</p>
                  <p className="text-xs" style={{ color: "var(--text-2)" }}>
                    {clients.find((client) => client.id === task.related_client_id)?.business_name ?? clients.find((client) => client.id === task.related_client_id)?.name ?? "Client"}
                    {task.due_date ? ` · ${dueLabel(task.due_date)}` : ""}
                    {task.created_at ? ` · ${daysWaiting(task.created_at)}d waiting` : ""}
                    {` · Follow-up: ${employees.find((e) => e.id === task.follow_up_owner)?.name ?? "Unassigned"}`}
                  </p>
                </div>
                <Button variant="ghost" disabled={taskActionSaving === task.id} onClick={() => void remindDashboardTask(task.id)}>Send reminder</Button>
                <div className="w-[170px] shrink-0"><SearchSelect
                  label={`Reassign follow-up for ${task.title}`} hideLabel value="" autoSelectSingle={false}
                  onChange={(id) => { if (id) void reassignFollowUp(task.id, id); }}
                  options={employees.map((e) => ({ id: e.id, label: e.name }))}
                  placeholder="Reassign owner…" disabled={taskActionSaving === task.id}
                  error={employeesError ? `Could not load employees: ${employeesError.message}` : undefined} /></div>
                <Link href="/admin/tasks" className="text-xs font-bold text-[#2563EB] hover:underline">Open</Link>
              </div>
            ))}
            {!waitingTasks.length && <p className="text-sm" style={{ color: "var(--text-2)" }}>No client tasks are waiting.</p>}
          </div>
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div><h2 className="font-semibold">Unassigned tasks</h2><p className="text-xs" style={{ color: "var(--text-2)" }}>{unassignedTasks.length} tasks need an owner</p></div>
            <Link href="/admin/tasks" className="text-xs font-semibold text-[#2563EB] hover:underline">Task Center</Link>
          </div>
          <div className="space-y-2">
            {unassignedTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <span className="min-w-[140px] flex-1 font-medium">{task.title}</span>
                <div className="w-[170px] shrink-0"><SearchSelect
                  label={`Assign ${task.title}`} hideLabel value="" autoSelectSingle={false}
                  onChange={(id) => { if (id) void assignDashboardTask(task.id, id); }}
                  options={employees.map((e) => ({ id: e.id, label: e.name }))}
                  placeholder="Assign to…" disabled={!!employeesError || taskActionSaving === task.id}
                  error={employeesError ? `Could not load employees: ${employeesError.message}` : undefined} /></div>
              </div>
            ))}
            {!unassignedTasks.length && <p className="text-sm" style={{ color: "var(--text-2)" }}>No unassigned tasks.</p>}
          </div>
        </Card>
      </div>
      {taskActionMessage && <p role="status" className="text-sm" style={{ color: taskActionMessage.includes("sent") || taskActionMessage.includes("assigned") ? "var(--text-2)" : "#DC2626" }}>{taskActionMessage}</p>}

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <h2 className="mb-4 text-base font-semibold">All Filings by Stage</h2>
          <p className="mb-3 text-xs" style={{ color: "var(--text-2)" }}>Created → Docs requested → Docs received → In preparation → Client review & e-sign → Filed → Completed. Overdue flags red when due passes before filing.</p>
          <Stepper steps={STAGES} current={3} />
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(stageCounts) as string[]).map((k) => (
              <Link key={k} href="/admin/tax-filings">
                <Badge tone={k === "overdue" ? "danger" : k === "completed" ? "success" : k === "filed" ? "accent" : "warning"}>
                  {k.replace(/_/g, " ")} {stageCounts[k]}
                </Badge>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="xl:col-span-5">
          <h2 className="mb-2 text-base font-semibold">Filings Completed vs Overdue</h2>
          <p className="eyebrow mb-2">Last 6 months</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="m" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="done" stroke="#2563EB" fill="#2563EB" fillOpacity={0.12} strokeWidth={2} name="Completed" />
                <Area type="monotone" dataKey="overdue" stroke="#DC2626" fill="#DC2626" fillOpacity={0.12} strokeWidth={2} name="Overdue" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <GstPaymentsPanel role="admin" riskOnly />

      <Card>
        <h2 className="mb-3 text-base font-semibold">Recent Activity</h2>
        {activity.length === 0 ? (
          <EmptyState icon={<FileClock size={22} />} title="No activity yet — actions across the firm will appear here" />
        ) : (
          <div className="fade-bottom max-h-72 space-y-3 overflow-y-auto">
            {activity.slice(0, 20).map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1 h-2 w-2 rounded-full" style={{ background: "#2563EB" }} />
                <div><span className="font-semibold">{a.actor_name ?? "Someone"}</span> <span style={{ color: "var(--text-2)" }}>{a.action} {a.entity_type}</span>
                  <p className="text-xs" style={{ color: "var(--text-2)" }}>{new Date(a.created_at).toLocaleString()}</p></div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Create new">
        <div className="grid gap-2">
          <Link href="/admin/clients" className="btn-ghost px-4 py-3 text-left" onClick={() => setNewOpen(false)}><Plus size={15} className="mr-2 inline" /> New Client</Link>
          <Link href="/admin/tax-filings" className="btn-ghost px-4 py-3 text-left" onClick={() => setNewOpen(false)}><Plus size={15} className="mr-2 inline" /> New Filing</Link>
          <Link href="/admin/tasks" className="btn-ghost px-4 py-3 text-left" onClick={() => setNewOpen(false)}><Plus size={15} className="mr-2 inline" /> New Task</Link>
        </div>
      </Modal>
    </div>
  );
}
