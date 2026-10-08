"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { createClient } from "@/lib/supabase/client";
import { usePendingCount } from "./approvals";
import { ThemeToggle, Modal, Badge } from "./ui";
import { ClientMobileSidebar, ClientSidebar } from "./client-sidebar";
import { EmployeeMobileSidebar, EmployeeSidebar } from "./employee-sidebar";
import { AdminMobileSidebar, AdminSidebar } from "./admin-sidebar";
import { useFilings, useTasks, usePayments, useMessages, useCurrentUser } from "@/lib/hooks";
import { isOverdue } from "@/lib/lifecycle";
import {
  LayoutDashboard, Users, FileText, FolderOpen, MessagesSquare, CheckSquare,
  CreditCard, BarChart3, Settings, LifeBuoy, AlertTriangle, Gauge, User as UserIcon, History, LogOut, Menu, PenLine, Phone, Bell,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: React.ReactNode; badge?: number; badgeTone?: "blue" | "red" };

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard size={20} />,
  clients: <Users size={20} />,
  filings: <FileText size={20} />,
  documents: <FolderOpen size={20} />,
  messages: <MessagesSquare size={20} />,
  tasks: <CheckSquare size={20} />,
  payments: <CreditCard size={20} />,
  team: <Users size={20} />,
  performance: <Gauge size={20} />,
  reports: <BarChart3 size={20} />,
  settings: <Settings size={20} />,
  help: <LifeBuoy size={20} />,
  escalations: <AlertTriangle size={20} />,
  account: <UserIcon size={20} />,
  history: <History size={20} />,
  contact: <Phone size={20} />,
  sign: <PenLine size={20} />,
  audit: <History size={20} />,
};

export function navFor(role: "admin" | "employee" | "client"): { menu: NavItem[]; support: NavItem[] } {
  const ic = (k: string) => ICONS[k];
  if (role === "admin") {
    const base = "/admin";
    return {
      menu: [
        { href: `${base}/dashboard`, label: "Dashboard", icon: ic("dashboard") },
        { href: `${base}/clients`, label: "Clients", icon: ic("clients") },
        { href: `${base}/tax-filings`, label: "Tax Filings", icon: ic("filings") },
        { href: `${base}/documents`, label: "Documents", icon: ic("documents") },
        { href: `${base}/messages`, label: "Messages", icon: ic("messages") },
        { href: `${base}/tasks`, label: "Task Management", icon: ic("tasks") },
        { href: `${base}/payments`, label: "Payments", icon: ic("payments") },
        { href: `${base}/team`, label: "Team & Performance", icon: ic("team") },
        { href: `${base}/performance`, label: "My Performance", icon: ic("performance") },
        { href: `${base}/reports`, label: "Reports & Analytics", icon: ic("reports") },
        { href: `${base}/audit`, label: "Audit Trail", icon: ic("audit") },
        { href: `${base}/settings`, label: "Settings", icon: ic("settings") },
      ],
      support: [
        { href: `${base}/help`, label: "Help & Support", icon: ic("help") },
        { href: `${base}/escalations`, label: "Escalations", icon: ic("escalations") },
      ],
    };
  }
  if (role === "employee") {
    const base = "/employee";
    return {
      menu: [
        { href: `${base}/dashboard`, label: "Dashboard", icon: ic("dashboard") },
        { href: `${base}/clients`, label: "Clients", icon: ic("clients") },
        { href: `${base}/tax-filings`, label: "Tax Filings", icon: ic("filings") },
        { href: `${base}/tasks`, label: "Task Management", icon: ic("tasks") },
        { href: `${base}/documents`, label: "Documents", icon: ic("documents") },
        { href: `${base}/messages`, label: "Messages", icon: ic("messages") },
        { href: `${base}/payments`, label: "Payments", icon: ic("payments") },
        { href: `${base}/performance`, label: "My Performance", icon: ic("performance") },
        { href: `${base}/reports`, label: "Reports & Analytics", icon: ic("reports") },
      ],
      support: [
        { href: `${base}/account`, label: "Account & Profile", icon: ic("account") },
        { href: `${base}/help`, label: "Help & Support", icon: ic("help") },
      ],
    };
  }
  const base = "/client";
  return {
    menu: [
      { href: `${base}/dashboard`, label: "Dashboard", icon: ic("dashboard") },
      { href: `${base}/tasks`, label: "Tasks", icon: ic("tasks") },
      { href: `${base}/tax-filings`, label: "Tax Filings", icon: ic("filings") },
      { href: `${base}/documents`, label: "Documents", icon: ic("documents") },
      { href: `${base}/messages`, label: "Messages", icon: ic("messages") },
      { href: `${base}/payments`, label: "Payments", icon: ic("payments") },
      { href: `${base}/history`, label: "Filing History", icon: ic("history") },
      { href: `${base}/account`, label: "Account & Profile", icon: ic("account") },
    ],
    support: [
      { href: `${base}/help`, label: "Help & Support", icon: ic("help") },
      { href: `${base}/contact`, label: "Contact Accountant", icon: ic("contact") },
    ],
  };
}

const ROLE_CHIP: Record<string, string> = { admin: "ADMIN", employee: "EMPLOYEE", client: "CLIENT" };
const ROLE_COLOR: Record<string, string> = { admin: "var(--accent)", employee: "var(--accent)", client: "var(--accent)" };

type Notice = { id: string; kind: string; title: string; body: string; href: string; urgent?: boolean };

function useNotices(role: "admin" | "employee" | "client"): Notice[] {
  const { data: filings = [] } = useFilings();
  const { data: tasks = [] } = useTasks();
  const { data: payments = [] } = usePayments();
  const { data: messages = [] } = useMessages();
  const { data: currentUser } = useCurrentUser();
  const meId = (currentUser as { id?: string } | null)?.id ?? null;
  const pendingCount = usePendingCount(role === "admin");
  const { data: escalations = [] } = useSWR(role === "admin" ? "escalations-open" : null, async () => {
    const sb = createClient();
    if (!sb) return [];
    const { data } = await sb.from("escalations").select("id,note").eq("status", "open").limit(5);
    return (data ?? []) as { id: string; note: string }[];
  });
  const { data: taskNotifs = [] } = useSWR("task-notifications", async () => {
    const sb = createClient();
    if (!sb) return [];
    const { data, error } = await sb.from("task_notifications")
      .select("id,event_type,message,read_at,created_at").order("created_at", { ascending: false }).limit(20);
    if (error) return [];
    return (data ?? []) as { id: string; event_type: string; message: string; read_at: string | null; created_at?: string }[];
  }, { refreshInterval: 15000 });

  return useMemo(() => {
    const out: Notice[] = [];
    const base = `/${role}`;
    // Individual task assignment / review notifications first (unread first)
    const sortedNotifs = [...taskNotifs].sort((a, b) => Number(Boolean(a.read_at)) - Number(Boolean(b.read_at)));
    for (const n of sortedNotifs.slice(0, 10)) {
      const label = String(n.event_type ?? "update").replace(/_/g, " ");
      out.push({
        id: `tasknotif-${n.id}`,
        kind: "Tasks",
        title: `${label.charAt(0).toUpperCase() + label.slice(1)}: ${(n.message ?? "").slice(0, 60)}${(n.message ?? "").length > 60 ? "…" : ""}`,
        body: n.read_at ? `Read · ${n.message ?? ""}`.slice(0, 100) : (n.message ?? "Task update").slice(0, 100),
        href: `${base}/tasks`,
        urgent: !n.read_at,
      });
    }
    if (role === "admin" && pendingCount > 0)
      out.push({ id: "approvals", kind: "Approvals", title: `${pendingCount} pending approval${pendingCount === 1 ? "" : "s"}`, body: "Review new team / client requests.", href: "/admin/team", urgent: true });
    const overdue = filings.filter((f) => isOverdue(String(f.status), f.due_date));
    if (overdue.length > 0)
      out.push({ id: "overdue", kind: "Filings", title: `${overdue.length} overdue filing${overdue.length === 1 ? "" : "s"}`, body: `${overdue[0].tax_type} ${overdue[0].period} needs attention.`, href: `${base}/tax-filings`, urgent: true });
    const openTasks = tasks.filter((t) => !["done", "cancelled"].includes(String(t.status)));
    if (openTasks.length > 0)
      out.push({ id: "tasks", kind: "Tasks", title: `${openTasks.length} open task${openTasks.length === 1 ? "" : "s"}`, body: "Tasks waiting for action.", href: `${base}/tasks` });
    const unread = messages.filter((m) => (meId ? m.recipient_id === meId && !m.read_at : !m.read_at));
    if (unread.length > 0)
      out.push({ id: "messages", kind: "Messages", title: `${unread.length} unread message${unread.length === 1 ? "" : "s"}`, body: "Replies landed in your inbox.", href: `${base}/messages` });
    const due = payments.filter((p) => String(p.status) !== "paid");
    if (due.length > 0)
      out.push({ id: "payments", kind: "Payments", title: `${due.length} unpaid invoice${due.length === 1 ? "" : "s"}`, body: "Invoices awaiting payment.", href: `${base}/payments` });
    if (role === "admin" && escalations.length > 0)
      out.push({ id: "escalations", kind: "Escalations", title: `${escalations.length} open escalation${escalations.length === 1 ? "" : "s"}`, body: String(escalations[0].note ?? "At-risk item flagged.").slice(0, 80), href: "/admin/escalations", urgent: true });
    return out;
  }, [filings, tasks, payments, messages, meId, pendingCount, escalations, taskNotifs, role]);
}

function NotificationsModal({ role, open, onClose }: { role: "admin" | "employee" | "client"; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const notices = useNotices(role);
  const [busyId, setBusyId] = useState<string | null>(null);
  async function view(n: Notice) {
    if (n.id.startsWith("tasknotif-")) {
      setBusyId(n.id);
      try {
        const sb = createClient();
        if (sb) await sb.rpc("mark_task_notification_read", { p_notification: n.id.replace("tasknotif-", "") });
        await mutate("task-notifications");
      } catch { /* still redirect */ } finally {
        setBusyId(null);
      }
    }
    onClose();
    router.push(n.href);
  }
  return (
    <Modal open={open} onClose={onClose} title="Notifications">
      <div className="space-y-2">
        {notices.length === 0 && <p className="rounded-xl p-6 text-center text-sm" style={{ background: "var(--bg)", color: "var(--text-2)" }}>You&apos;re all caught up — no new notifications.</p>}
        {notices.map((n) => (
          <div key={n.id} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: n.urgent ? "#FEE2E2" : "var(--accent-tint)", color: n.urgent ? "#DC2626" : "var(--accent)" }}>
              {n.kind === "Approvals" ? <Users size={16} /> : n.kind === "Filings" ? <FileText size={16} /> : n.kind === "Tasks" ? <CheckSquare size={16} /> : n.kind === "Messages" ? <MessagesSquare size={16} /> : n.kind === "Payments" ? <CreditCard size={16} /> : <AlertTriangle size={16} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-bold">{n.title}</span>
                <Badge tone={n.urgent ? "danger" : "accent"}>{n.kind}</Badge>
              </span>
              <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-2)" }}>{n.body}</span>
            </span>
            <button onClick={() => view(n)} disabled={busyId === n.id} className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {busyId === n.id ? "Opening…" : "View"}
            </button>
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Close</button>
        </div>
      </div>
    </Modal>
  );
}

export function DashboardShell({ role, name, children, title }: { role: "admin" | "employee" | "client"; name: string; children: React.ReactNode; title?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { menu, support } = navFor(role);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  // Live pending-approval count for admins (Realtime-backed, 30s poll fallback).
  const pendingCount = usePendingCount(role === "admin");
  const headerNotices = useNotices(role);
  const notifCount = headerNotices.length;
  const { data: clientOpenTaskCountData, error: clientTaskCountError } = useSWR(role === "client" ? "client-open-task-nav-count" : null, async () => {
    const sb = createClient();
    if (!sb) return 0;
    const { data, error } = await sb.from("tasks").select("id")
      .eq("task_for", "client").not("status", "in", "(done,cancelled)");
    if (error) throw error;
    return data.length;
  }, { refreshInterval: 30000 });
  void clientTaskCountError;
  const clientOpenTaskCount = clientOpenTaskCountData ?? 0;
  const menuWithBadges: NavItem[] = menu
    .map((item) => {
      if (role === "admin" && item.href === "/admin/team" && pendingCount > 0) return { ...item, badge: pendingCount };
      if (role === "client" && item.href === "/client/tasks" && clientOpenTaskCount > 0) return { ...item, badge: clientOpenTaskCount, badgeTone: "red" };
      return item;
    });

  async function handleLogout() {
    const sb = createClient();
    if (sb) await sb.auth.signOut();
    router.push("/login");
  }

  const renderNav = (items: NavItem[]) =>
    items.map((item) => {
      const active = pathname === item.href || (item.href.endsWith("/dashboard") && pathname?.endsWith(`/${role}`));
      return (
        <Link key={item.href} href={item.href} className={`nav-item flex items-center gap-3 px-3 py-2.5 text-sm font-bold ${active ? "active" : ""}`}
          style={active ? {} : { color: "var(--text)" }} onClick={() => setMobileOpen(false)}>
          <span className="shrink-0">{item.icon}</span>
          {!collapsed && <span className="flex-1">{item.label}</span>}
          {!collapsed && item.badge ? (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: item.badgeTone === "red" ? "#DC2626" : "var(--accent)" }}>
              {item.badge}
            </span>
          ) : null}
        </Link>
      );
    });

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Sidebar desktop — premium grouped UI for client + employee, legacy for admin */}
      {role === "client" ? (
        <ClientSidebar
          name={name}
          pathname={pathname}
          menuWithBadges={menuWithBadges}
          support={support}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onLogout={handleLogout}
        />
      ) : role === "employee" ? (
        <EmployeeSidebar
          name={name}
          pathname={pathname}
          menuWithBadges={menuWithBadges}
          support={support}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onLogout={handleLogout}
        />
      ) : (
        <AdminSidebar
          name={name}
          pathname={pathname}
          menuWithBadges={menuWithBadges}
          support={support}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          onLogout={handleLogout}
        />
      )}

      {/* Mobile drawer — premium UI for client + employee */}
      {mobileOpen && role === "client" && (
        <ClientMobileSidebar
          name={name}
          pathname={pathname}
          menuWithBadges={menuWithBadges}
          support={support}
          onClose={() => setMobileOpen(false)}
          onLogout={handleLogout}
        />
      )}
      {mobileOpen && role === "employee" && (
        <EmployeeMobileSidebar
          name={name}
          pathname={pathname}
          menuWithBadges={menuWithBadges}
          support={support}
          onClose={() => setMobileOpen(false)}
          onLogout={handleLogout}
        />
      )}
      {mobileOpen && role === "admin" && (
        <AdminMobileSidebar
          name={name}
          pathname={pathname}
          menuWithBadges={menuWithBadges}
          support={support}
          onClose={() => setMobileOpen(false)}
          onLogout={handleLogout}
        />
      )}

      <div className="workspace-body flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="glass-bar sticky top-0 z-30 flex h-16 items-center gap-3 px-4 md:px-8">
          <button className="btn-ghost p-2 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 items-center gap-1.5 text-sm sm:flex">
            {(() => {
              const segs = (pathname ?? "").split("/").filter(Boolean);
              const base = segs[0] ?? role;
              const rest = segs.slice(1);
              const label = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <>
                  <Link href={`/${base}/dashboard`} className="shrink-0 font-bold hover:underline" style={{ color: "var(--text-2)" }}>TaxDesk</Link>
                  {rest.length === 0 && (
                    <>
                      <span style={{ color: "var(--text-2)" }}>/</span>
                      <span className="truncate font-bold" style={{ color: "var(--text)" }}>Dashboard</span>
                    </>
                  )}
                  {rest.map((seg, i) => {
                    const href = `/${base}/${rest.slice(0, i + 1).join("/")}`;
                    const last = i === rest.length - 1;
                    return (
                      <span key={href} className="flex min-w-0 items-center gap-1.5">
                        <span style={{ color: "var(--text-2)" }}>/</span>
                        {last ? (
                          <span className="truncate font-bold" style={{ color: "var(--text)" }}>{label(seg)}</span>
                        ) : (
                          <Link href={href} className="shrink-0 font-medium hover:underline" style={{ color: "var(--text-2)" }}>{label(seg)}</Link>
                        )}
                      </span>
                    );
                  })}
                </>
              );
            })()}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden min-w-0 items-center gap-2 rounded-[10px] border px-3 py-2 text-sm lg:flex" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }}>
              <span className="text-xs">⌘K</span>
              <input placeholder="Search…" className="w-full min-w-0 max-w-[160px] bg-transparent outline-none" style={{ color: "var(--text)" }} id="global-search" />
            </div>
            <span className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline-flex" style={{ background: "#DCFCE7", color: "#16A34A" }}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "#16A34A" }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#16A34A" }} />
              </span>
              {role === "employee" ? "Online" : `${ROLE_CHIP[role]} · Online`}
            </span>
            <button
              className="btn-ghost relative p-2"
              aria-label={notifCount > 0 ? `${notifCount} notifications` : "Notifications"}
              title={notifCount > 0 ? `${notifCount} notification${notifCount === 1 ? "" : "s"} — view now` : "No new notifications"}
              onClick={() => setShowNotifs(true)}
            >
              <Bell size={18} />
              {notifCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold text-white" style={{ background: "#DC2626" }}>
                  {notifCount > 9 ? "9+" : notifCount}
                </span>
              )}
            </button>
            <div className="hidden sm:block"><ThemeToggle /></div>
            <Link
              href={role === "admin" ? "/admin/settings" : `/${role}/account`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white transition-transform hover:scale-105"
              style={{ background: ROLE_COLOR[role] }}
              aria-label="Account & profile"
              title="Account & profile"
            >
              {name.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-6 p-4 md:p-8" style={{ padding: 32 }}>
          {clientTaskCountError && <p role="alert" className="rounded-lg px-3 py-2 text-sm text-[#DC2626]">Could not load your task badge: {clientTaskCountError.message}</p>}
          {title ? (
            <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: "var(--text-2)" }}>
              <span>TaxDesk</span><span>/</span><span>{ROLE_CHIP[role]}</span><span>/</span><span style={{ color: "var(--text)" }}>{title}</span>
            </div>
          ) : null}
          {children}
        </main>
      </div>
      <NotificationsModal role={role} open={showNotifs} onClose={() => setShowNotifs(false)} />
    </div>
  );
}
