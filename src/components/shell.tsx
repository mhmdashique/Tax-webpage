"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "./ui";
import {
  LayoutDashboard, Users, FileText, FolderOpen, MessagesSquare, CheckSquare,
  CreditCard, BarChart3, Settings, LifeBuoy, AlertTriangle, Gauge, User as UserIcon, History, LogOut, Menu, PenLine, Phone,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: React.ReactNode };

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
const ROLE_COLOR: Record<string, string> = { admin: "#2563EB", employee: "#0EA5A4", client: "#6366F1" };

export function DashboardShell({ role, name, children, title }: { role: "admin" | "employee" | "client"; name: string; children: React.ReactNode; title?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { menu, support } = navFor(role);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    const sb = createClient();
    if (sb) await sb.auth.signOut();
    router.push("/login");
  }

  const renderNav = (items: NavItem[]) =>
    items.map((item) => {
      const active = pathname === item.href || (item.href.endsWith("/dashboard") && pathname?.endsWith(`/${role}`));
      return (
        <Link key={item.href} href={item.href} className={`nav-item flex items-center gap-3 px-3 py-2.5 text-sm font-medium ${active ? "active" : ""}`}
          style={active ? {} : { color: "var(--text)" }} onClick={() => setMobileOpen(false)}>
          <span className="shrink-0">{item.icon}</span>
          {!collapsed && <span>{item.label}</span>}
        </Link>
      );
    });

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen flex-col md:flex" style={{ width: collapsed ? 72 : 264, background: "var(--sidebar-bg)", borderRight: "1px solid var(--border)" }}>
        <div className="flex h-16 items-center gap-2 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl font-bold text-white" style={{ background: ROLE_COLOR[role] }}>T</div>
          {!collapsed && (
            <div>
              <p className="text-sm font-bold leading-none">TaxDesk</p>
              <p className="text-[11px]" style={{ color: "var(--text-2)" }}>FilePilot OS</p>
            </div>
          )}
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          <div>
            {!collapsed && <p className="eyebrow px-3 pb-2">Menu</p>}
            <nav className="space-y-1">{renderNav(menu)}</nav>
          </div>
          <div>
            {!collapsed && <p className="eyebrow px-3 pb-2">Support</p>}
            <nav className="space-y-1">{renderNav(support)}</nav>
          </div>
        </div>
        <div className="space-y-3 border-t p-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            {!collapsed && <span className="text-xs" style={{ color: "var(--text-2)" }}>Theme</span>}
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: ROLE_COLOR[role], boxShadow: `0 0 0 2px ${ROLE_COLOR[role]}55` }}>
              {name.slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{name}</p>
                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${ROLE_COLOR[role]}22`, color: ROLE_COLOR[role] }}>{ROLE_CHIP[role]}</span>
              </div>
            )}
            {!collapsed && (
              <button onClick={handleLogout} className="btn-ghost p-2" aria-label="Logout"><LogOut size={15} /></button>
            )}
          </div>
          <button onClick={() => setCollapsed((c) => !c)} className="btn-ghost w-full py-1.5 text-xs">{collapsed ? "»" : "« Collapse"}</button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col p-4" style={{ background: "var(--sidebar-bg)" }}>
            <nav className="space-y-1 overflow-y-auto">{renderNav([...menu, ...support])}</nav>
            <div className="mt-auto flex items-center justify-between pt-4">
              <ThemeToggle />
              <button onClick={handleLogout} className="btn-ghost px-3 py-2 text-sm">Logout</button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="glass-bar sticky top-0 z-30 flex h-16 items-center gap-3 px-4 md:px-8">
          <button className="btn-ghost p-2 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
          <div className="hidden min-w-0 flex-1 items-center md:flex">
            <div className="flex w-full max-w-md items-center gap-2 rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }}>
              <span className="text-xs">⌘K</span>
              <input placeholder="Search clients, filings, tasks… (Ctrl+K)" className="w-full bg-transparent outline-none" style={{ color: "var(--text)" }} id="global-search" />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline-block" style={{ background: `${ROLE_COLOR[role]}1f`, color: ROLE_COLOR[role] }}>{ROLE_CHIP[role]} · PRO</span>
            <button className="btn-ghost relative p-2" aria-label="Notifications">
              <span>🔔</span>
            </button>
            <div className="hidden sm:block"><ThemeToggle /></div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: ROLE_COLOR[role] }}>{name.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-6 p-4 md:p-8" style={{ padding: 32 }}>
          {title ? (
            <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: "var(--text-2)" }}>
              <span>TaxDesk</span><span>/</span><span>{ROLE_CHIP[role]}</span><span>/</span><span style={{ color: "var(--text)" }}>{title}</span>
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
