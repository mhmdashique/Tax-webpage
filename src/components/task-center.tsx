"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase/client";
import { useClients, useFilings, useTasks } from "@/lib/hooks";
import type { Client, Filing, Task } from "@/types/database";
import { dueLabel } from "@/lib/data";
import { Badge, Button, Card, EmptyState, Modal } from "./ui";
import { SearchSelect, type SearchSelectOption } from "./search-select";
import { CheckSquare, Plus } from "lucide-react";

type TaskType = {
  id: string;
  task_key: string;
  name: string;
  task_group: "Client tasks" | "Employee tasks" | "Admin tasks";
  default_title: string;
  default_priority: "low" | "normal" | "high" | "urgent";
  default_due_days: number;
  allowed_creator_roles: string[];
  assignee_role: "employee" | "client";
  requires_filing: boolean;
  requires_document: boolean;
};

type TaskDocument = { id: string; client_id: string; filing_id: string | null; file_name: string };
type TaskAssigneeOption = { id: string; name: string; role: string };
type TaskClientOption = { id: string; name: string; business_name?: string | null };
type TaskFor = "" | "employee" | "client";

const taskStatuses = ["open", "in_progress", "done", "cancelled"];
const priorities = ["low", "normal", "high", "urgent"] as const;

function useTaskAssigneeUsers() {
  return useSWR<TaskAssigneeOption[]>("task-center-users", async () => {
    const sb = createClient();
    if (!sb) throw new Error("Connect Supabase to load task assignees.");
    const { data, error } = await sb.from("users").select("id,name,role").limit(200);
    if (error) throw error;
    return data ?? [];
  });
}

function dateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** DD-MM-YYYY hh:mm for seen/activity timestamps. */
export function fmtDT(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type TaskEventRow = { id: string; event: string; actor_id: string | null; details: Record<string, unknown> | null; created_at: string };

/** Client progress chip for staff: where the client stands on a client task. */
export function clientProgress(task: Task, today: string): { label: string; tone: "success" | "warning" | "danger" | "accent" | "neutral" } {
  if (task.task_for !== "client") return { label: "Staff task", tone: "neutral" };
  if (String(task.status) === "cancelled") return { label: "Cancelled", tone: "neutral" };
  const overdue = !["done", "cancelled"].includes(String(task.status)) && !!task.due_date && task.due_date < today;
  if (overdue && String(task.client_status) !== "done_by_client") return { label: "Overdue", tone: "danger" };
  switch (String(task.client_status ?? "not_seen")) {
    case "seen": return { label: "Seen", tone: "accent" };
    case "in_progress": return { label: "In progress", tone: "accent" };
    case "done_by_client": return { label: "Done by client", tone: "warning" };
    case "reviewed": return { label: "Reviewed", tone: "success" };
    case "cancelled": return { label: "Cancelled", tone: "neutral" };
    default: return { label: "Not seen", tone: "warning" };
  }
}

/** Whole days since the task was created (days waiting). */
export function daysWaiting(fromIso?: string | null): number {
  const from = fromIso ? new Date(fromIso).getTime() : Date.now();
  if (Number.isNaN(from)) return 0;
  return Math.max(0, Math.floor((Date.now() - from) / 864e5));
}

/** Staff task details: creator, sent-to, seen, history, reminders, comments, edits, review. */
export function TaskDetailsModal({
  task, users, currentUserId, role, onClose, onChanged,
}: {
  task: Task;
  users: TaskAssigneeOption[];
  currentUserId: string;
  role: "admin" | "employee";
  onClose: () => void;
  onChanged: () => void;
}) {
  const sb = createClient();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [showReopen, setShowReopen] = useState(false);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [notes, setNotes] = useState(task.notes ?? "");
  const { data: events = [], mutate: mutateEvents } = useSWR<TaskEventRow[]>(["task-events", task.id], async () => {
    if (!sb) return [];
    const { data, error } = await sb.from("task_events").select("*").eq("task_id", task.id).order("created_at", { ascending: true }).limit(200);
    if (error) throw error;
    return (data ?? []) as TaskEventRow[];
  });
  const nameOf = (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? "—";
  const canAct = role === "admin" || task.follow_up_owner === currentUserId || task.assigned_to === currentUserId;

  async function run(kind: string, fn: () => Promise<{ error: unknown }>) {
    setBusy(kind);
    setError("");
    try {
      const { error } = await fn();
      if (error) throw error;
      setComment("");
      setReopenReason("");
      setShowReopen(false);
      await Promise.all([mutateEvents(), onChanged()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy("");
    }
  }

  const reminders = events.filter((e) => e.event === "reminder_sent");
  const comments = events.filter((e) => e.event === "commented");

  return (
    <Modal open onClose={onClose} title={task.title} size="xl">
      <div className="space-y-5">
        <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <p><span style={{ color: "var(--text-2)" }}>Created by: </span><span className="font-semibold">{nameOf(task.created_by)} · {fmtDT(task.created_at).slice(0, 10)}</span></p>
          <p><span style={{ color: "var(--text-2)" }}>Sent to: </span><span className="font-semibold">{nameOf(task.assigned_to)}</span></p>
          <p><span style={{ color: "var(--text-2)" }}>Follow-up: </span><span className="font-semibold">{task.follow_up_owner ? nameOf(task.follow_up_owner) : "—"}</span></p>
          <p><span style={{ color: "var(--text-2)" }}>Seen: </span><span className="font-semibold">{task.seen_at ? `Seen on ${fmtDT(task.seen_at)}` : "Not seen yet"}</span></p>
          <p><span style={{ color: "var(--text-2)" }}>Last client activity: </span><span className="font-semibold">{fmtDT(task.last_client_activity_at)}</span></p>
          <p><span style={{ color: "var(--text-2)" }}>Last reminder: </span><span className="font-semibold">{task.last_reminder_at ? fmtDT(task.last_reminder_at) : "Never"}</span></p>
        </div>
        {task.reopened_reason && (
          <p className="rounded-xl px-3 py-2 text-xs font-medium" style={{ background: "var(--warn-bg)", color: "var(--warn-tx)" }}>
            Reopened: {task.reopened_reason}
          </p>
        )}
        {task.notes && <p className="rounded-xl p-3 text-sm" style={{ background: "var(--bg)" }}>{task.notes}</p>}

        {task.task_for === "client" && String(task.client_status) === "done_by_client" && canAct && (
          <div className="flex flex-wrap gap-2">
            <Button className="px-4 py-2 text-xs" disabled={busy !== ""} onClick={() => void run("review", async () => {
              if (!sb) return { error: new Error("Not connected") };
              return sb.rpc("review_task", { p_task: task.id, p_action: "reviewed", p_reason: null });
            })}>{busy === "review" ? "Reviewing…" : "Mark reviewed"}</Button>
            <Button variant="ghost" className="px-4 py-2 text-xs" onClick={() => setShowReopen((v) => !v)}>Reopen</Button>
          </div>
        )}
        {showReopen && (
          <div className="space-y-2">
            <textarea value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={2}
              placeholder="Reason shown to the client (required)…"
              className="w-full rounded-[10px] border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
            <Button variant="danger" className="px-4 py-2 text-xs" disabled={busy !== "" || !reopenReason.trim()}
              onClick={() => void run("reopen", async () => {
                if (!sb) return { error: new Error("Not connected") };
                return sb.rpc("review_task", { p_task: task.id, p_action: "reopen", p_reason: reopenReason.trim() });
              })}>{busy === "reopen" ? "Reopening…" : "Confirm reopen"}</Button>
          </div>
        )}

        {canAct && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">Due<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="ml-1 rounded-lg border px-2 py-1.5 text-xs" style={{ background: "var(--bg)", borderColor: "var(--border)" }} /></label>
            <div className="min-w-[180px] flex-1 text-xs">
              <SearchSelect
                label="Priority"
                value={priority}
                onChange={(id) => setPriority(id as Task["priority"])}
                options={priorities.map((p) => ({ id: p, label: p }))}
                clearable={false}
                autoSelectSingle={false}
              />
            </div>
            <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy !== ""}
              onClick={() => void run("edit", async () => {
                if (!sb) return { error: new Error("Not connected") };
                return sb.rpc("update_task_details", { p_task: task.id, p_due_date: dueDate || null, p_priority: priority, p_notes: notes || null });
              })}>Save edits</Button>
            {task.task_for === "client" && (
              <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy !== ""}
                onClick={() => void run("remind", async () => {
                  if (!sb) return { error: new Error("Not connected") };
                  return sb.rpc("send_task_reminder", { p_task: task.id });
                })}>Send reminder</Button>
            )}
          </div>
        )}
        {notes !== (task.notes ?? "") && <p className="text-xs" style={{ color: "var(--text-2)" }}>Notes edited — press Save edits.</p>}
        <div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Staff notes (audited when saved)…"
            className="w-full rounded-[10px] border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
        </div>

        <div>
          <p className="eyebrow mb-2">Comments ({comments.length})</p>
          <div className="space-y-2">
            {comments.length === 0 && <p className="text-xs" style={{ color: "var(--text-2)" }}>No comments yet.</p>}
            {comments.map((c) => (
              <div key={c.id} className="rounded-xl p-3 text-sm" style={{ background: "var(--bg)" }}>
                <p className="mb-1 text-xs font-semibold">{nameOf(c.actor_id)} · {fmtDT(c.created_at)}
                  {(c.details?.kind as string) === "question" && <Badge> question</Badge>}</p>
                <p>{String(c.details?.body ?? "")}</p>
              </div>
            ))}
          </div>
          {canAct && (
            <div className="mt-2 flex gap-2">
              <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…"
                className="flex-1 rounded-[10px] border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
              <Button className="px-4 py-2 text-xs" disabled={busy !== "" || !comment.trim()}
                onClick={() => void run("comment", async () => {
                  if (!sb) return { error: new Error("Not connected") };
                  return sb.rpc("add_task_comment", { p_task: task.id, p_comment: comment.trim(), p_kind: "comment" });
                })}>Send</Button>
            </div>
          )}
        </div>

        <div>
          <p className="eyebrow mb-2">History</p>
          <div className="space-y-1.5">
            {events.length === 0 && <p className="text-xs" style={{ color: "var(--text-2)" }}>No events yet.</p>}
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs">
                <Badge tone="neutral">{e.event.replace(/_/g, " ")}</Badge>
                <span style={{ color: "var(--text-2)" }}>{nameOf(e.actor_id)} · {fmtDT(e.created_at)}</span>
                {e.event === "status_changed" && e.details && (
                  <span>{String((e.details.from as string) ?? "").replace(/_/g, " ")} → {String((e.details.to as string) ?? "").replace(/_/g, " ")}</span>
                )}
                {e.event === "reopened" && e.details?.reason != null && <span>— {String(e.details.reason)}</span>}
              </div>
            ))}
          </div>
          {reminders.length > 0 && (
            <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>
              Reminders sent: {reminders.map((r) => fmtDT(r.created_at)).join(", ")}
            </p>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-[#DC2626]">{error}</p>}
      </div>
    </Modal>
  );
}

export function AddTaskButton({
  role,
  client,
  filing,
  document,
  preselectedAssigneeId,
  label = "Add task",
  onCreated,
}: {
  role: "admin" | "employee" | "client";
  client?: Client | null;
  filing?: Filing | null;
  document?: TaskDocument | null;
  preselectedAssigneeId?: string;
  label?: string;
  onCreated?: (taskId: string, title: string, clientName: string, taskFor: "employee" | "client") => void;
}) {
  const { mutate } = useSWRConfig();
  const { data: taskTypes = [], error: taskTypesError } = useSWR<TaskType[]>("task-types", async () => {
    const sb = createClient();
    if (!sb) return [];
    const { data, error } = await sb.from("task_types").select("*").order("task_group").order("name");
    if (error) throw error;
    return (data ?? []) as TaskType[];
  });
  const { data: clients = [] } = useClients();
  const { data: filings = [] } = useFilings();
  const { data: users = [], error: usersError, isLoading: usersLoading } = useTaskAssigneeUsers();
  const { data: tasks = [] } = useTasks();
  const [open, setOpen] = useState(false);
  const [taskFor, setTaskFor] = useState<TaskFor>("");
  const [attempted, setAttempted] = useState(false);
  const [clientId, setClientId] = useState(client?.id ?? filing?.client_id ?? document?.client_id ?? "");
  const [filingId, setFilingId] = useState(filing?.id ?? document?.filing_id ?? "");
  const [documentId, setDocumentId] = useState(document?.id ?? "");
  const [typeId, setTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskType["default_priority"]>("normal");
  const [dueDate, setDueDate] = useState(dateAfter(3));
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [followUpOwnerId, setFollowUpOwnerId] = useState("");
  const [notifyClient, setNotifyClient] = useState(true);
  const [saveUnassigned, setSaveUnassigned] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  useEffect(() => {
    const sb = createClient();
    if (sb) void sb.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? ""));
  }, []);

  const selectedType = taskTypes.find((taskType) => taskType.id === typeId);
  const selectedClient = clients.find((item) => item.id === clientId);
  const { data: clientUserOptions = [], error: clientUsersError, isLoading: clientUsersLoading } = useSWR<TaskAssigneeOption[]>(
    selectedClient ? ["task-client-users", selectedClient.id] : null,
    async () => {
      const sb = createClient();
      if (!sb || !selectedClient) return [];
      const { data, error } = await sb.rpc("task_client_user_options", { p_client: selectedClient.id });
      if (error) throw error;
      return (data ?? []).map((row: { id: string; name: string }) => ({ ...row, role: "client" }));
    },
  );
  const effectiveAssigneeId = taskFor === "client" ? assigneeId || clientUserOptions[0]?.id || "" : assigneeId;
  const { data: clientEmployeeOptions = [], error: clientAssignmentsError, isLoading: clientEmployeesLoading } = useSWR<TaskAssigneeOption[]>(
    selectedClient ? ["task-client-employees", selectedClient.id] : null,
    async () => {
      const sb = createClient();
      if (!sb || !selectedClient) return [];
      const { data, error } = await sb.rpc("task_client_employee_options", { p_client: selectedClient.id });
      if (error) throw error;
      return (data ?? []).map((row: { id: string; name: string }) => ({ ...row, role: "employee" }));
    },
  );
  // Employees may only follow up on their own client tasks (server-enforced), so
  // for the employee role the owner is always self — never another employee from
  // the client's assignment list. Admins keep the assigned-employee default.
  const effectiveFollowUpOwnerId = role === "employee"
    ? (followUpOwnerId || currentUserId)
    : (followUpOwnerId || clientEmployeeOptions[0]?.id || "");
  const selfLoading = role === "employee" && !currentUserId;
  const { data: employeeClientOptions = [], error: employeeClientsError } = useSWR<TaskClientOption[]>(
    taskFor === "employee" && assigneeId && role !== "client"
      ? ["task-employee-clients", assigneeId]
      : null,
    async () => {
      const sb = createClient();
      if (!sb || !assigneeId) return [];
      const { data, error } = await sb.rpc("task_employee_client_options", { p_employee: assigneeId });
      if (error) throw error;
      return (data ?? []) as TaskClientOption[];
    },
  );
  const availableTaskTypes = taskTypes.filter((item) =>
    !!taskFor
    && item.assignee_role === (taskFor === "client" ? "client" : "employee")
    && item.allowed_creator_roles.includes(role)
  );
  const clientFilings = filings.filter((item) => item.client_id === clientId);
  const clientChoices = taskFor === "employee" && role !== "client" && assigneeId
    ? employeeClientOptions
    : clients;
  const eligibleUsers = taskFor === "client"
    ? clientUserOptions
    : role === "client" ? clientEmployeeOptions
    : users.filter((user) => user.role === "employee"
      && (role === "admin" || user.id === currentUserId));
  const duplicateTask = !!selectedType && tasks.some((task) =>
    task.related_client_id === clientId
    && task.related_filing_id === filingId
    && task.task_type_id === selectedType.id
    && !["done", "cancelled"].includes(String(task.status))
  );
  const employeeWorkloadTasks = tasks.filter((task) =>
    task.assigned_to === assigneeId && !["done", "cancelled"].includes(String(task.status))
  );

  // Preselect dependent values: primary linked client user + assigned employee.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (taskFor === "client" && clientUserOptions.length > 0 && !assigneeId) {
      setAssigneeId(clientUserOptions[0].id);
    }
  }, [taskFor, clientUserOptions, assigneeId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (taskFor !== "client" || followUpOwnerId) return;
    if (role === "employee") {
      // Self once the account id has loaded; never another employee.
      if (currentUserId) setFollowUpOwnerId(currentUserId);
    } else if (clientEmployeeOptions.length > 0) {
      setFollowUpOwnerId(clientEmployeeOptions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskFor, followUpOwnerId, role, currentUserId, clientEmployeeOptions.length]);
  // Own assignment rows for the selected client (RLS only reveals the
  // caller's own rows, so a miss + a different assigned_employee_id means
  // this employee is genuinely not assigned and the server will reject).
  const { data: myAssignmentRows = [], isLoading: myAssignmentLoading } = useSWR<{ employee_id: string }[]>(
    role === "employee" && clientId && currentUserId ? ["task-my-assignment", clientId, currentUserId] : null,
    async () => {
      const sb = createClient();
      if (!sb || !clientId || !currentUserId) return [];
      const { data, error } = await sb.from("client_assignments")
        .select("employee_id").eq("client_id", clientId).eq("employee_id", currentUserId).limit(1);
      if (error) throw error;
      return (data ?? []) as { employee_id: string }[];
    },
  );
  const assignedToMe = !!selectedClient && !!currentUserId &&
    (selectedClient.assigned_employee_id === currentUserId || myAssignmentRows.length > 0);
  const showNotAssignedWarning = role === "employee" && !!clientId && !!currentUserId &&
    !myAssignmentLoading && !assignedToMe;
  const { data: documentOptions = [], error: documentsError } = useSWR<TaskDocument[]>(
    clientId ? ["task-documents", clientId] : null,
    async () => {
      const sb = createClient();
      if (!sb || !clientId) return [];
      const { data, error } = await sb.from("documents").select("id,client_id,filing_id,file_name")
        .eq("client_id", clientId).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as TaskDocument[];
    },
  );

  const todayKey = new Date().toISOString().slice(0, 10);
  const employeeOptions: SearchSelectOption[] = eligibleUsers.map((user) => {
    const openCount = tasks.filter((t) => t.assigned_to === user.id && !["done", "cancelled"].includes(String(t.status))).length;
    const overdueCount = tasks.filter((t) => t.assigned_to === user.id && !["done", "cancelled"].includes(String(t.status)) && t.due_date && t.due_date < todayKey).length;
    return { id: user.id, label: user.name, sublabel: user.role, badge: `${openCount} open, ${overdueCount} overdue` };
  });
  const clientSelectOptions: SearchSelectOption[] = clientChoices.map((item) => ({
    id: item.id, label: item.business_name ?? item.name, sublabel: item.business_name ? item.name : undefined,
  }));
  const taskTypeOptions: SearchSelectOption[] = availableTaskTypes.map((item) => ({
    id: item.id, label: item.name, sublabel: item.task_group, group: item.task_group,
  }));
  const filingOptions: SearchSelectOption[] = clientFilings.map((item) => ({
    id: item.id, label: `${item.tax_type} · ${item.period}`, sublabel: item.due_date ?? undefined,
  }));
  const documentSelectOptions: SearchSelectOption[] = documentOptions.map((d) => ({ id: d.id, label: d.file_name }));
  const clientUserSelectOptions: SearchSelectOption[] = clientUserOptions.map((u) => ({ id: u.id, label: u.name, sublabel: "Client user" }));
  const followUpPool = clientEmployeeOptions.length ? clientEmployeeOptions : users.filter((u) => u.role === "employee");
  const followUpOptions: SearchSelectOption[] = followUpPool.map((u) => ({ id: u.id, label: u.name, sublabel: u.role }));
  const priorityOptions: SearchSelectOption[] = priorities.map((p) => ({ id: p, label: p[0].toUpperCase() + p.slice(1) }));

  function chooseType(taskType: TaskType) {
    setTypeId(taskType.id);
    setTitle(taskType.default_title);
    setPriority(taskType.default_priority);
    setDueDate(dateAfter(taskType.default_due_days));
    const defaultAssignee = taskFor === "employee"
      ? (role === "employee" ? currentUserId : assigneeId)
      : clientUserOptions[0]?.id ?? "";
    setAssigneeId(defaultAssignee);
    if (taskFor === "client") {
      setFollowUpOwnerId(role === "employee" ? currentUserId : clientEmployeeOptions[0]?.id ?? "");
    }
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (role === "employee" && !currentUserId) { setError("Still loading your account — wait a moment and try again."); return; }
    if (!taskFor) { setError("Choose whether this is an employee task or a client task."); return; }
    if (!selectedType) { setError("Choose a task type."); return; }
    if ((!clientId && (role !== "admin" || taskFor === "client")) || (role === "employee" && !clientId)) { setError("Choose a client."); return; }
    if (!effectiveAssigneeId && !saveUnassigned) { setError("Choose an assignee."); return; }
    if (taskFor === "client" && !effectiveFollowUpOwnerId) { setError("Choose a follow-up employee."); return; }
    if (selectedType.requires_filing && !filingId) { setError("Choose the filing for this task."); return; }
    if (selectedType.requires_document && !documentId) { setError("Choose a document for this task."); return; }
    const sb = createClient();
    if (!sb) { setError("Connect Supabase before creating tasks."); return; }
    setIsSaving(true);
    setError("");
    const { data: createdId, error: createError } = await sb.rpc("create_task_for_assignment", {
      p_task_type: selectedType.id,
      p_task_for: taskFor,
      p_title: title.trim(),
      p_client: clientId || null,
      p_filing: filingId || null,
      p_document: documentId || null,
      p_assignee: effectiveAssigneeId || null,
      p_follow_up_owner: taskFor === "client" ? effectiveFollowUpOwnerId || null : null,
      p_priority: priority,
      p_due_date: dueDate || null,
      p_notes: notes.trim() || null,
      p_save_unassigned: saveUnassigned,
      p_notify_client: notifyClient,
    });
    setIsSaving(false);
    if (createError) { setError(createError.message); return; }
    const createdTitle = title.trim();
    const createdClientName = clients.find((item) => item.id === clientId)?.business_name
      ?? clients.find((item) => item.id === clientId)?.name ?? "";
    await Promise.all([mutate("tasks"), mutate("task-notifications")]);
    setOpen(false);
    setTypeId("");
    setAttempted(false);
    setTaskFor("");
    setTitle("");
    setNotes("");
    setAssigneeId("");
    setFollowUpOwnerId("");
    if (onCreated && taskFor) onCreated((createdId as string) ?? "", createdTitle, createdClientName, taskFor);
  }

  return (
    <>
      <Button onClick={() => {
        setClientId(client?.id ?? filing?.client_id ?? document?.client_id ?? "");
        setFilingId(filing?.id ?? document?.filing_id ?? "");
        setDocumentId(document?.id ?? "");
        setTaskFor(role === "client" ? "employee" : preselectedAssigneeId ? "employee" : "");
        setTypeId("");
        const initialAssignee = preselectedAssigneeId || (role === "employee" ? currentUserId : "");
        setAssigneeId(initialAssignee);
        setFollowUpOwnerId(role === "employee" ? currentUserId : "");
        setSaveUnassigned(false);
        setError("");
        setAttempted(false);
        setOpen(true);
      }}><Plus size={15} />{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create and assign task" size="xl">
        <form onSubmit={submit} className="space-y-5">
          {error && <p role="alert" className="rounded-xl px-3 py-2 text-sm text-[#DC2626]" style={{ background: "var(--danger-bg)" }}>{error}</p>}
          {usersError && <p role="alert" className="rounded-xl px-3 py-2 text-sm text-[#DC2626]" style={{ background: "var(--danger-bg)" }}>Could not load task assignees: {usersError.message}</p>}
          {taskTypesError && <p role="alert" className="rounded-xl px-3 py-2 text-sm text-[#DC2626]" style={{ background: "var(--danger-bg)" }}>Could not load task types: {taskTypesError.message}</p>}
          {clientUsersError && <p role="alert" className="rounded-xl px-3 py-2 text-sm text-[#DC2626]" style={{ background: "var(--danger-bg)" }}>Could not load client task members: {clientUsersError.message}</p>}
          {taskFor === "client" && selectedClient && !clientUsersLoading && !clientUsersError && clientUserOptions.length === 0 && (
            <p role="alert" className="rounded-xl px-3 py-2 text-sm text-[#DC2626]" style={{ background: "var(--danger-bg)" }}>
              No client users are linked to <strong>{selectedClient.business_name ?? selectedClient.name}</strong>. Open the client record and set a linked user first.
            </p>
          )}
          {clientAssignmentsError && taskFor === "client" && <p role="alert" className="rounded-xl px-3 py-2 text-sm text-[#DC2626]" style={{ background: "var(--danger-bg)" }}>Could not load assigned employees: {clientAssignmentsError.message}</p>}
          {showNotAssignedWarning && selectedClient && (
            <p role="alert" className="rounded-xl px-3 py-2 text-sm text-[#B45309]" style={{ background: "var(--warning-bg, #FEF3C7)" }}>
              You are not assigned to <strong>{selectedClient.business_name ?? selectedClient.name}</strong>, so this task will be rejected.
              Ask an admin to assign you to this client first.
            </p>
          )}
          {employeeClientsError && <p role="alert" className="rounded-xl px-3 py-2 text-sm text-[#DC2626]" style={{ background: "var(--danger-bg)" }}>Could not load this employee&apos;s clients: {employeeClientsError.message}</p>}

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Task for <span className="text-[#DC2626]">*</span></legend>
            {role === "client"
              ? <p className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>Employee task · Raise a query for your assigned employee</p>
              : <div className="flex flex-wrap gap-2">
                {(["employee", "client"] as const).map((audience) => (
                  <button type="button" key={audience} aria-pressed={taskFor === audience}
                    onClick={() => {
                      setTaskFor(audience);
                      setTypeId("");
                      setTitle("");
                      setAssigneeId(audience === "employee" && role === "employee" ? currentUserId : "");
                      setFollowUpOwnerId(audience === "client" && role === "employee" ? currentUserId : "");
                      setClientId("");
                      setFilingId("");
                      setDocumentId("");
                      setSaveUnassigned(false);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${taskFor === audience ? "text-white" : ""}`}
                    style={taskFor === audience ? { background: "var(--accent)" } : { background: "var(--bg)", border: "1px solid var(--border)" }}>
                    {audience} task
                  </button>
                ))}
              </div>}
            {!taskFor && <p className="text-xs text-[#DC2626]">Choose the task audience.</p>}
          </fieldset>

          {taskFor && <div className="grid gap-4 md:grid-cols-2">
            {taskFor === "employee" && <SearchSelect
              label="Employee"
              required={!saveUnassigned}
              value={assigneeId}
              onChange={(id) => {
                setAssigneeId(id);
                setClientId("");
                setFilingId("");
                setDocumentId("");
              }}
              options={employeeOptions}
              placeholder="Search employees"
              loading={usersLoading}
              error={usersError ? `Could not load employees: ${usersError.message}` : undefined}
              validationMessage={attempted && !assigneeId && !saveUnassigned ? "Choose an employee." : undefined}
            />}
            <SearchSelect
              label={`Client${taskFor === "client" || role !== "admin" ? "" : " (optional)"}`}
              required={taskFor === "client" || role !== "admin"}
              value={clientId}
              onChange={(nextClientId) => {
                setClientId(nextClientId);
                setFilingId("");
                setDocumentId("");
                if (taskFor === "client") {
                  setAssigneeId("");
                  setFollowUpOwnerId(role === "employee" ? currentUserId : "");
                } else if (role === "admin") {
                  const linked = clients.find((item) => item.id === nextClientId)?.assigned_employee_id ?? "";
                  setAssigneeId(linked);
                }
              }}
              options={clientSelectOptions}
              placeholder="Search clients"
              disabledReason={taskFor === "employee" && assigneeId ? "Showing this employee's assigned clients." : undefined}
              error={employeeClientsError ? `Could not load this employee's clients: ${employeeClientsError.message}` : undefined}
              validationMessage={attempted && !clientId && (taskFor === "client" || role !== "admin") ? "Choose a client." : undefined}
              emptyText="No matches for your search."
            />
            <SearchSelect
              label="Task type"
              required
              value={typeId}
              onChange={(id) => {
                const found = availableTaskTypes.find((t) => t.id === id);
                if (found) chooseType(found);
                else setTypeId("");
              }}
              options={taskTypeOptions}
              placeholder={`Search ${taskFor} task types`}
              groupBy={(o) => o.group ?? ""}
              error={taskTypesError ? `Could not load task types: ${taskTypesError.message}` : undefined}
              validationMessage={attempted && !selectedType ? "Choose a task type." : undefined}
              emptyText="No matching types permitted for this task audience."
            />
          </div>}

          {selectedType && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <SearchSelect
                  label="Filing"
                  required={selectedType.requires_filing}
                  value={filingId}
                  onChange={(id) => { setFilingId(id); setDocumentId(""); }}
                  options={filingOptions}
                  placeholder="Search filings"
                  disabled={!clientId}
                  disabledReason={!clientId ? "Choose a client first." : undefined}
                  validationMessage={attempted && selectedType.requires_filing && !filingId ? "A filing is required for this task." : undefined}
                  emptyText={clientId ? "No filings for this client." : undefined}
                />
                <SearchSelect
                  label="Document"
                  required={selectedType.requires_document}
                  value={documentId}
                  onChange={setDocumentId}
                  options={documentSelectOptions}
                  placeholder="Search documents"
                  disabled={!clientId}
                  disabledReason={!clientId ? "Choose a client first." : undefined}
                  loading={!!clientId && documentOptions.length === 0 && !documentsError ? undefined : undefined}
                  error={documentsError ? `Could not load documents: ${documentsError.message}` : undefined}
                  validationMessage={attempted && selectedType.requires_document && !documentId ? "A document is required for this task." : undefined}
                  emptyText={clientId ? "No documents for this client." : undefined}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {taskFor === "client" && <SearchSelect
                  label="Send to"
                  required
                  value={effectiveAssigneeId}
                  onChange={setAssigneeId}
                  options={clientUserSelectOptions}
                  placeholder={!clientUsersLoading && clientUserOptions.length === 0 ? "No linked users" : "Search client users"}
                  disabled={!clientId || clientUsersLoading || (!clientUsersLoading && clientUserOptions.length === 0)}
                  disabledReason={!clientId ? "Choose a client first." : undefined}
                  loading={clientUsersLoading}
                  error={clientUsersError ? `Could not load client users: ${clientUsersError.message}` : undefined}
                  validationMessage={attempted && !effectiveAssigneeId && !clientUsersLoading && clientUserOptions.length > 0 ? "Choose a client user." : undefined}
                  emptyText={clientId && !clientUsersLoading && clientUserOptions.length === 0 ? "This client has no linked user." : undefined}
                  noOptionsHint={clientId && !clientUsersLoading && clientUserOptions.length === 0 && selectedClient ? (
                    <span>This client has no linked user. Link a user to the client first.{" "}
                      <Link href="/admin/clients" className="font-semibold text-[var(--accent)] hover:underline">Open client profile</Link>
                    </span>
                  ) : undefined}
                />}
                {taskFor === "client" && (role === "admin"
                  ? <SearchSelect
                      label="Follow-up owner"
                      required
                      value={effectiveFollowUpOwnerId}
                      onChange={setFollowUpOwnerId}
                      options={followUpOptions}
                      placeholder="Search employees"
                      disabled={!clientId}
                      disabledReason={!clientId ? "Choose a client first." : undefined}
                      error={clientAssignmentsError ? `Could not load assigned employees: ${clientAssignmentsError.message}` : undefined}
                      validationMessage={attempted && !effectiveFollowUpOwnerId ? "Choose a follow-up employee." : undefined}
                    />
                  : <div className="space-y-2">
                      <p className="text-sm font-semibold">Follow-up owner</p>
                      <p className="inline-flex rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "var(--surface)" }}>
                        {selfLoading
                          ? "Loading your account…"
                          : `Assigned employee: ${clientEmployeeOptions.find((user) => user.id === effectiveFollowUpOwnerId)?.name ?? users.find((user) => user.id === effectiveFollowUpOwnerId)?.name ?? "You"}`}
                      </p>
                    </div>)}
                <div className="grid grid-cols-2 gap-3">
                  <SearchSelect
                    label="Priority"
                    value={priority}
                    onChange={(id) => setPriority(id as TaskType["default_priority"])}
                    options={priorityOptions}
                    clearable={false}
                    autoSelectSingle={false}
                  />
                  <label className="space-y-1.5 text-sm font-semibold">Due date
                    <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm font-normal" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
                  </label>
                </div>
                {taskFor === "employee" && assigneeId && <Card className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Current workload · {users.find((user) => user.id === assigneeId)?.name ?? "Employee"}</h3>
                    <Badge tone={employeeWorkloadTasks.some((task) => task.due_date && task.due_date < new Date().toISOString().slice(0, 10)) ? "warning" : "neutral"}>
                      {employeeWorkloadTasks.filter((task) => task.due_date && task.due_date < new Date().toISOString().slice(0, 10)).length} overdue
                    </Badge>
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-2)" }}>
                    {employeeWorkloadTasks.length} open tasks. Assignment is still allowed when workload is high.
                  </p>
                  {employeeWorkloadTasks.slice(0, 5).map((task) => (
                    <div key={task.id} className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs" style={{ borderColor: "var(--border)" }}>
                      <span className="min-w-0 flex-1 font-medium">{task.title}</span>
                      <span>{clients.find((clientItem) => clientItem.id === task.related_client_id)?.business_name ?? clients.find((clientItem) => clientItem.id === task.related_client_id)?.name ?? "No client"}</span>
                      <span>{task.due_date ?? "No due date"}</span><Badge>{task.priority}</Badge><Badge>{String(task.status).replace(/_/g, " ")}</Badge>
                    </div>
                  ))}
                  {!employeeWorkloadTasks.length && <p className="text-xs" style={{ color: "var(--text-2)" }}>No open tasks assigned.</p>}
                </Card>}
                {duplicateTask && <p role="status" className="rounded-xl px-3 py-2 text-sm text-[#B45309]" style={{ background: "var(--warning-bg, #FEF3C7)" }}>
                  A similar open task already exists for this client and filing.
                </p>}
                {taskFor === "client" && <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={notifyClient} onChange={(event) => setNotifyClient(event.target.checked)} />
                  Notify client by email
                </label>}
              </div>
              <label className="block space-y-1.5 text-sm font-semibold">Task title
                <input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm font-normal" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
              </label>
              <label className="block space-y-1.5 text-sm font-semibold">Notes
                <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add any details for the assignee"
                  className="w-full resize-y rounded-xl border px-3 py-2.5 text-sm font-normal" style={{ background: "var(--bg)", borderColor: "var(--border)" }} />
              </label>
              {role === "admin" && taskFor === "employee" && <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={saveUnassigned} onChange={(event) => { setSaveUnassigned(event.target.checked); if (event.target.checked) { setAssigneeId(""); } }} />
                Save as unassigned
              </label>}
              <div className="flex justify-end border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <Button disabled={isSaving || selfLoading || !taskFor || !selectedType || !title.trim() || (!effectiveAssigneeId && !saveUnassigned) || (!clientId && (role !== "admin" || taskFor === "client")) || (taskFor === "client" && !effectiveFollowUpOwnerId) || (taskFor === "client" && !clientUsersLoading && clientUserOptions.length === 0)}>
                  {isSaving ? "Assigning…" : "Assign task"}
                </Button>
              </div>
            </>
          )}
        </form>
      </Modal>
    </>
  );
}

/** Document options are loaded via SWR inside AddTaskButton (see documentOptions). Kept for backwards-compat imports. */
export function TaskDocumentOptions() {
  return null;
}

function TaskSettingsPanel() {
  const sb = createClient();
  const { data, error, mutate } = useSWR<{ overload_open_task_threshold: number }>(
    "task-settings",
    async () => {
      if (!sb) throw new Error("Connect Supabase to load task settings.");
      const { data: settings, error: queryError } = await sb.from("task_settings")
        .select("overload_open_task_threshold").eq("id", true).single();
      if (queryError) throw queryError;
      return settings;
    },
  );
  const [thresholdOverride, setThresholdOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const threshold = thresholdOverride ?? (data ? String(data.overload_open_task_threshold) : "");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(threshold);
    if (!Number.isInteger(value) || value < 0) {
      setMessage("Enter a whole number greater than or equal to zero.");
      return;
    }
    if (!sb) { setMessage("Connect Supabase before updating task settings."); return; }
    setSaving(true);
    setMessage("");
    const { error: updateError } = await sb.from("task_settings")
      .update({ overload_open_task_threshold: value, updated_at: new Date().toISOString() }).eq("id", true);
    setSaving(false);
    if (updateError) { setMessage(updateError.message); return; }
    setMessage("Workload threshold saved.");
    await mutate();
  }

  return <Card>
    <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px] flex-1">
        <h2 className="text-sm font-semibold">Workload setting</h2>
        <label className="mt-2 block text-xs" htmlFor="task-workload-threshold">Open tasks before an assignee is flagged as overloaded</label>
        {error ? <p role="alert" className="mt-1 text-xs text-[#DC2626]">Could not load workload setting: {error.message}</p>
          : <input id="task-workload-threshold" type="number" min="0" step="1" required value={threshold}
            onChange={(event) => setThresholdOverride(event.target.value)}
            className="mt-1 w-full max-w-xs rounded-lg border px-3 py-2 text-sm"
            style={{ background: "var(--bg)", borderColor: "var(--border)" }} />}
      </div>
      <Button disabled={saving || !!error || threshold === ""}>{saving ? "Saving…" : "Save threshold"}</Button>
      {message && <p role="status" className="w-full text-xs" style={{ color: message.includes("saved") ? "var(--text-2)" : "#DC2626" }}>{message}</p>}
    </form>
  </Card>;
}

/** Employee home: client tasks waiting on the client, grouped by client. */
export function WaitingOnClientsCard() {
  const { data: tasks = [], mutate } = useTasks();
  const { data: clients = [] } = useClients();
  const [myId, setMyId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    const sb = createClient();
    if (sb) void sb.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? ""));
  }, []);

  const waiting = tasks.filter((t) =>
    t.task_for === "client"
    && !["done", "cancelled"].includes(String(t.status))
    && (t.follow_up_owner === myId || t.created_by === myId)
  );
  const overdueCount = waiting.filter((t) => t.due_date && t.due_date < today).length;
  const byClient = useMemo(() => {
    const map = new Map<string, { name: string; tasks: Task[] }>();
    for (const t of waiting) {
      const c = clients.find((c) => c.id === t.related_client_id);
      const name = c?.business_name ?? c?.name ?? "Unknown client";
      const key = t.related_client_id ?? "none";
      if (!map.has(key)) map.set(key, { name, tasks: [] });
      map.get(key)!.tasks.push(t);
    }
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, myId, clients]);

  async function remind(id: string) {
    const sb = createClient();
    if (!sb) return;
    setBusy(id);
    setMessage("");
    const { error } = await sb.rpc("send_task_reminder", { p_task: id });
    setBusy("");
    if (error) setMessage(error.message);
    else { setMessage("Reminder sent."); await mutate(); }
  }

  async function markReviewed(id: string) {
    const sb = createClient();
    if (!sb) return;
    setBusy(id);
    setMessage("");
    const { error } = await sb.rpc("review_task", { p_task: id, p_action: "reviewed", p_reason: null });
    setBusy("");
    if (error) setMessage(error.message);
    else { setMessage("Task marked reviewed."); await mutate(); }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Waiting on clients ({waiting.length})</h2>
        {overdueCount > 0 && <Badge tone="danger">{overdueCount} overdue</Badge>}
        <Link href="/employee/tasks" className="ml-auto text-xs font-bold text-[var(--accent)] hover:underline">Open task center</Link>
      </div>
      {message && <p role="status" className="mb-3 rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "var(--bg)" }}>{message}</p>}
      {waiting.length === 0 ? (
        <EmptyState icon={<CheckSquare size={22} />} title="Nothing waiting — clients are all caught up" />
      ) : (
        <div className="space-y-4">
          {byClient.map((g) => (
            <div key={g.name}>
              <p className="eyebrow mb-2">{g.name}</p>
              <div className="space-y-2">
                {g.tasks.map((t) => {
                  const progress = clientProgress(t, today);
                  const overdue = !!t.due_date && t.due_date < today;
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)" }}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{t.title}</p>
                        <p className="text-xs" style={{ color: "var(--text-2)" }}>
                          {daysWaiting(t.created_at)}d waiting · {t.due_date ? dueLabel(t.due_date) : "No due date"}
                        </p>
                      </div>
                      <Badge tone={progress.tone}>{progress.label}</Badge>
                      {overdue && <Badge tone="danger">Overdue</Badge>}
                      <button onClick={() => void remind(t.id)} disabled={busy === t.id}
                        className="btn-ghost rounded-[10px] px-3 py-1.5 text-xs font-bold disabled:opacity-50">
                        {busy === t.id ? "Sending…" : "Send reminder"}
                      </button>
                      <Link href="/employee/tasks" className="btn-ghost rounded-[10px] px-3 py-1.5 text-xs font-bold">Open</Link>
                      {String(t.client_status) === "done_by_client" && (
                        <button onClick={() => void markReviewed(t.id)} disabled={busy === t.id}
                          className="rounded-[10px] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
                          {busy === t.id ? "…" : "Mark reviewed"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function TaskCenter({ role, readOnly = false }: { role: "admin" | "employee"; readOnly?: boolean }) {
  const { data = [], error, isLoading, mutate } = useTasks();
  const { data: clients = [] } = useClients();
  const { data: filings = [] } = useFilings();
  const { data: users = [], error: usersError } = useTaskAssigneeUsers();
  const { data: taskTypes = [], error: taskTypesError } = useSWR<TaskType[]>("task-types", async () => {
    const sb = createClient();
    if (!sb) return [];
    const { data: rows, error: queryError } = await sb.from("task_types").select("*").order("name");
    if (queryError) throw queryError;
    return (rows ?? []) as TaskType[];
  });
  const [filter, setFilter] = useState("my");
  const [audFilter, setAudFilter] = useState<"all" | "employee" | "client">("all");
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [createdToast, setCreatedToast] = useState<{ id: string; title: string; clientName: string } | null>(null);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    const sb = createClient();
    if (sb) void sb.auth.getUser().then(({ data: authData }) => setCurrentUserId(authData.user?.id ?? ""));
  }, []);

  const filtered = useMemo(() => data.filter((task) => {
    const openTask = !["done", "cancelled"].includes(String(task.status));
    if (audFilter !== "all" && task.task_for !== audFilter) return false;
    if (filter === "my" && (task.task_for === "client"
      ? task.follow_up_owner !== currentUserId
      : task.assigned_to !== currentUserId)) return false;
    if (filter === "waiting" && (task.task_for !== "client" || task.follow_up_owner !== currentUserId || !openTask)) return false;
    if (filter === "created" && task.created_by !== currentUserId) return false;
    if (filter === "review" && (task.task_for !== "client" || String(task.client_status) !== "done_by_client" || !openTask)) return false;
    if (filter === "review" && role !== "admin" && task.follow_up_owner !== currentUserId) return false;
    if (filter === "overdue" && (!openTask || !task.due_date || task.due_date >= today)) return false;
    if (filter === "today" && task.due_date !== today) return false;
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
    if (statusFilter !== "all" && task.status !== statusFilter) return false;
    if (clientFilter !== "all" && task.related_client_id !== clientFilter) return false;
    if (assigneeFilter !== "all" && task.assigned_to !== assigneeFilter) return false;
    if (typeFilter !== "all" && task.task_type_id !== typeFilter) return false;
    const clientName = clients.find((client) => client.id === task.related_client_id)?.name ?? "";
    const filingName = filings.find((filing) => filing.id === task.related_filing_id)?.period ?? "";
    return `${task.title} ${clientName} ${filingName}`.toLowerCase().includes(search.toLowerCase());
  }), [data, filter, audFilter, role, currentUserId, today, priorityFilter, statusFilter, clientFilter, assigneeFilter, typeFilter, clients, filings, search]);
  const selectedTasks = data.filter((task) => selected.includes(task.id));
  const canBulkAssign = selectedTasks.length > 0 && selectedTasks.every((task) =>
    taskTypes.find((taskType) => taskType.id === task.task_type_id)?.assignee_role === "employee");

  async function statusChange(task: Task, status: string) {
    let reason: string | null = null;
    if (status === "cancelled") {
      reason = window.prompt("Enter a reason for cancelling this task:")?.trim() ?? "";
      if (!reason) return;
    }
    const sb = createClient();
    if (!sb) return;
    setSaving(task.id);
    const { error: updateError } = await sb.rpc("change_task_status", {
      p_task: task.id, p_status: status, p_reason: reason,
    });
    setSaving("");
    if (updateError) setMessage(updateError.message);
    else { setMessage("Task status updated."); await mutate(); }
  }

  async function reassign(task: Task, assignee: string) {
    const sb = createClient();
    if (!sb) return;
    setSaving(task.id);
    const { error: assignError } = task.task_for === "client"
      ? await sb.rpc("reassign_task_follow_up", { p_task: task.id, p_owner: assignee })
      : await sb.rpc("reassign_task", { p_task: task.id, p_assignee: assignee });
    setSaving("");
    if (assignError) setMessage(assignError.message);
    else { setMessage("Task reassigned and notifications queued."); await mutate(); }
  }

  async function bulkApply() {
    const sb = createClient();
    if (!sb) return;
    setSaving("bulk");
    for (const taskId of selected) {
      if (bulkAssignee && canBulkAssign) {
        const { error: assignError } = await sb.rpc("reassign_task", { p_task: taskId, p_assignee: bulkAssignee });
        if (assignError) { setMessage(assignError.message); setSaving(""); return; }
      }
      if (bulkPriority) {
        const { error: priorityError } = await sb.rpc("change_task_priority", { p_task: taskId, p_priority: bulkPriority });
        if (priorityError) { setMessage(priorityError.message); setSaving(""); return; }
      }
    }
    setSaving("");
    setSelected([]);
    setMessage("Bulk task updates applied.");
    await mutate();
  }

  const filters = role === "admin"
    ? ["my", "all", "overdue", "today", "waiting", "created", "review"]
    : ["my", "overdue", "today", "waiting", "created", "review"];
  const filterLabels: Record<string, string> = {
    today: "Due today", my: "My tasks", all: "All tasks", waiting: "Waiting on clients",
    overdue: "Overdue", created: "Created by me", review: "Completed by client",
  };
  const detailTask = data.find((t) => t.id === detailTaskId) ?? null;
  const waitingCount = data.filter((t) => t.task_for === "client" && t.follow_up_owner === currentUserId && !["done", "cancelled"].includes(String(t.status))).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold">Task Center</h1><p className="text-sm" style={{ color: "var(--text-2)" }}>Create, assign, and track client work in one place.</p></div>
        {!readOnly && <AddTaskButton role={role} label="Add task" onCreated={(id, title, clientName, taskFor) => {
          setCreatedToast({ id, title, clientName });
          setMessage(taskFor === "client" ? `Task sent to ${clientName || "client"}.` : "Task created.");
          if (taskFor === "client") { setFilter("waiting"); setAudFilter("client"); }
        }} />}
      </div>
      {createdToast && (
        <p role="status" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}>
          Task sent to {createdToast.clientName || "client"}.
          {createdToast.id && <button className="ml-2 underline" onClick={() => { setDetailTaskId(createdToast.id); setCreatedToast(null); }}>View task</button>}
          <button className="ml-2 underline" onClick={() => setCreatedToast(null)}>Dismiss</button>
        </p>
      )}
      {role === "admin" && !readOnly && <TaskSettingsPanel />}
      {usersError && <p role="alert" className="text-sm text-[#DC2626]">Could not load task assignees: {usersError.message}</p>}
      {taskTypesError && <p role="alert" className="text-sm text-[#DC2626]">Could not load task types: {taskTypesError.message}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {filters.filter((item) => role === "admin" || item !== "all").map((item) => <button key={item} onClick={() => setFilter(item)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${filter === item ? "text-white" : ""}`}
          style={filter === item ? { background: "var(--accent)" } : { background: "var(--surface)", border: "1px solid var(--border)" }}>
          {filterLabels[item] ?? item}
          {item === "waiting" && waitingCount > 0 ? ` (${waitingCount})` : ""}
          <span className="ml-1 opacity-75">{item === "overdue" ? data.filter((task) => !["done", "cancelled"].includes(String(task.status)) && task.due_date && task.due_date < today).length : item === "today" ? data.filter((task) => task.due_date === today).length : ""}</span>
        </button>)}
        <span className="inline-flex shrink-0 items-center gap-1 px-1 text-xs font-semibold" style={{ color: "var(--text-2)" }}>Task for:</span>
        {(["all", "employee", "client"] as const).map((a) => (
          <button key={a} onClick={() => setAudFilter(a)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${audFilter === a ? "text-white" : ""}`}
            style={audFilter === a ? { background: "var(--accent)" } : { background: "var(--surface)", border: "1px solid var(--border)" }}>
            {a === "all" ? "All" : a === "employee" ? "Employee tasks" : "Client tasks"}
          </button>
        ))}
        <div className="w-[150px] shrink-0"><SearchSelect label="Priority filter" hideLabel clearable={false} value={priorityFilter} onChange={setPriorityFilter} autoSelectSingle={false}
          options={[{ id: "all", label: "All priorities" }, ...priorities.map((p) => ({ id: p, label: p }))]} placeholder="All priorities" /></div>
        <div className="w-[150px] shrink-0"><SearchSelect label="Status filter" hideLabel clearable={false} value={statusFilter} onChange={setStatusFilter} autoSelectSingle={false}
          options={[{ id: "all", label: "All statuses" }, ...taskStatuses.map((s) => ({ id: s, label: s.replace(/_/g, " ") }))]} placeholder="All statuses" /></div>
        <div className="w-[170px] shrink-0"><SearchSelect label="Client filter" hideLabel clearable={false} value={clientFilter} onChange={setClientFilter} autoSelectSingle={false}
          options={[{ id: "all", label: "All clients" }, ...clients.map((c) => ({ id: c.id, label: c.business_name ?? c.name, sublabel: c.business_name ? c.name : undefined }))]} placeholder="All clients" /></div>
        <div className="w-[170px] shrink-0"><SearchSelect label="Assignee filter" hideLabel clearable={false} value={assigneeFilter} onChange={setAssigneeFilter} autoSelectSingle={false}
          options={[{ id: "all", label: "All assignees" }, ...users.map((u) => ({ id: u.id, label: u.name, sublabel: u.role }))]} placeholder="All assignees" /></div>
        <div className="w-[170px] shrink-0"><SearchSelect label="Type filter" hideLabel clearable={false} value={typeFilter} onChange={setTypeFilter} autoSelectSingle={false}
          options={[{ id: "all", label: "All task types" }, ...taskTypes.map((t) => ({ id: t.id, label: t.name }))]} placeholder="All task types" /></div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, clients, filings"
          className="h-9 w-[200px] shrink-0 rounded-full border px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
      </div>
      {role === "admin" && !readOnly && selected.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <strong className="mr-2 text-sm">{selected.length} selected</strong>
          {canBulkAssign
            ? <div className="w-[180px] shrink-0"><SearchSelect label="Assign to" hideLabel value={bulkAssignee} onChange={setBulkAssignee} autoSelectSingle={false}
                options={users.filter((u) => u.role === "employee").map((u) => ({ id: u.id, label: u.name }))} placeholder="Assign to…" /></div>
            : <span className="text-xs" style={{ color: "var(--text-2)" }}>Bulk assignment is available only when all selected tasks are employee-assigned.</span>}
          <div className="w-[160px] shrink-0"><SearchSelect label="Set priority" hideLabel value={bulkPriority} onChange={setBulkPriority} autoSelectSingle={false}
            options={priorities.map((p) => ({ id: p, label: p }))} placeholder="Set priority…" /></div>
          <Button disabled={saving === "bulk" || (!(bulkAssignee && canBulkAssign) && !bulkPriority)} onClick={bulkApply}>Apply</Button>
        </Card>
      )}
      {message && <p role="status" className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--surface)" }}>{message}</p>}
      {error ? <Card><p role="alert" className="text-sm text-[#DC2626]">Could not load tasks: {error.message}</p></Card>
        : isLoading ? <Card><div className="skeleton h-40" /></Card>
          : !filtered.length ? <Card><EmptyState icon={<CheckSquare size={22} />} title="No tasks match these filters." action={!readOnly ? <AddTaskButton role={role} label="Add task" /> : undefined} /></Card>
            : <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[1150px] text-sm">
                <thead><tr className="border-b text-left text-xs uppercase tracking-wide" style={{ color: "var(--text-2)", borderColor: "var(--border)" }}>
                  {role === "admin" && <th className="p-3"><input aria-label="Select all visible tasks" type="checkbox" checked={filtered.length > 0 && filtered.every((task) => selected.includes(task.id))}
                    onChange={(event) => setSelected(event.target.checked ? filtered.map((task) => task.id) : [])} /></th>}
                  <th className="p-3">Task</th><th className="p-3">Client / filing</th><th className="p-3">Sent to</th><th className="p-3">Follow-up</th><th className="p-3">Priority / due</th><th className="p-3">Client progress</th><th className="p-3">Last activity</th><th className="p-3">Status</th><th className="p-3">Reassign</th>
                </tr></thead>
                <tbody>{filtered.map((task) => {
                  const clientName = clients.find((client) => client.id === task.related_client_id)?.business_name
                    ?? clients.find((client) => client.id === task.related_client_id)?.name ?? "—";
                  const filing = filings.find((item) => item.id === task.related_filing_id);
                  const reassignChoices = task.task_for === "client"
                    ? users.filter((user) => user.role === "employee")
                    : users.filter((user) => user.role === "employee" && (role === "admin" || user.id === currentUserId));
                  const eligibleReassignChoices = reassignChoices;
                  const dueLabelText = task.due_date ? dueLabel(task.due_date) : "No due date";
                  const overdue = !["done", "cancelled"].includes(String(task.status)) && task.due_date && task.due_date < today;
                  const progress = clientProgress(task, today);
                  return <tr key={task.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    {role === "admin" && <td className="p-3"><input aria-label={`Select ${task.title}`} type="checkbox" checked={selected.includes(task.id)}
                      onChange={(event) => setSelected(event.target.checked ? [...selected, task.id] : selected.filter((id) => id !== task.id))} /></td>}
                    <td className="p-3"><button onClick={() => setDetailTaskId(task.id)} className="text-left font-semibold text-[var(--accent)] hover:underline">{task.title}</button><p className="text-xs" style={{ color: "var(--text-2)" }}>{task.notes ?? "Manual task"}</p></td>
                    <td className="p-3">{clientName}<span className="block text-xs" style={{ color: "var(--text-2)" }}>{filing ? `${filing.tax_type} · ${filing.period}` : ""}</span></td>
                    <td className="p-3 text-xs">{task.task_for === "client" ? (users.find((user) => user.id === task.assigned_to)?.name ?? "Unassigned") : "—"}</td>
                    <td className="p-3 text-xs">{task.task_for === "client" ? (users.find((user) => user.id === task.follow_up_owner)?.name ?? "Unassigned") : (users.find((user) => user.id === task.assigned_to)?.name ?? "Unassigned")}</td>
                    <td className="p-3"><Badge tone={task.priority === "urgent" || overdue ? "danger" : task.priority === "high" ? "warning" : "neutral"}>{task.priority}</Badge>
                      <span className={`mt-1 block text-xs ${overdue ? "font-semibold text-[#DC2626]" : ""}`}>{dueLabelText}</span></td>
                    <td className="p-3">{task.task_for === "client" ? <Badge tone={progress.tone}>{progress.label}</Badge> : <span className="text-xs" style={{ color: "var(--text-2)" }}>—</span>}</td>
                    <td className="p-3 text-xs" style={{ color: "var(--text-2)" }}>{task.last_client_activity_at ? fmtDT(task.last_client_activity_at) : "—"}</td>
                    <td className="p-3 min-w-[170px]">{readOnly || (role !== "admin" && task.assigned_to !== currentUserId) ? <Badge>{String(task.status).replace(/_/g, " ")}</Badge> : <SearchSelect
                      label={`Status for ${task.title}`} hideLabel value={String(task.status)} autoSelectSingle={false} clearable={false}
                      onChange={(id) => { if (id) void statusChange(task, id); }}
                      options={taskStatuses.map((s) => ({ id: s, label: s.replace(/_/g, " ") }))} placeholder="Status…" disabled={saving === task.id} />}</td>
                    <td className="p-3 min-w-[170px]">{!readOnly && (role === "admin" || (task.task_for !== "client" && task.assigned_to === currentUserId)) && <SearchSelect
                      label={task.task_for === "client" ? `Follow-up owner for ${task.title}` : `Reassign ${task.title}`} hideLabel
                      value="" onChange={(id) => { if (id) void reassign(task, id); }} autoSelectSingle={false}
                      options={eligibleReassignChoices.map((u) => ({ id: u.id, label: u.name, sublabel: u.role }))}
                      placeholder={task.task_for === "client" ? "Follow-up owner…" : "Reassign…"} disabled={saving === task.id} />}</td>
                  </tr>;
                })}</tbody>
              </table>
            </Card>}
      {detailTask && (
        <TaskDetailsModal
          task={detailTask}
          users={users}
          currentUserId={currentUserId}
          role={role === "admin" ? "admin" : "employee"}
          onClose={() => setDetailTaskId(null)}
          onChanged={() => mutate()}
        />
      )}
      {readOnly && <Card><p className="eyebrow mb-2">Workload monitor (read-only)</p><p className="text-sm" style={{ color: "var(--text-2)" }}>{data.filter((task) => !["done", "cancelled"].includes(String(task.status))).length} open tasks are visible to your role.</p></Card>}
    </div>
  );
}
