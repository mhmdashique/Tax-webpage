"use client";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  FileText,
  CheckSquare,
  FolderOpen,
  MessagesSquare,
  CreditCard,
  Gauge,
  BarChart3,
  Settings,
  LifeBuoy,
  AlertTriangle,
  History,
  LogOut,
  X,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { ThemeToggle } from "./ui";
import type { NavItem } from "./shell";

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard size={18} />,
  clients: <Users size={18} />,
  filings: <FileText size={18} />,
  tasks: <CheckSquare size={18} />,
  documents: <FolderOpen size={18} />,
  messages: <MessagesSquare size={18} />,
  payments: <CreditCard size={18} />,
  team: <Users size={18} />,
  performance: <Gauge size={18} />,
  reports: <BarChart3 size={18} />,
  settings: <Settings size={18} />,
  help: <LifeBuoy size={18} />,
  escalations: <AlertTriangle size={18} />,
  audit: <History size={18} />,
};

export function adminNav(): { overview: NavItem[]; management: NavItem[]; finance: NavItem[]; support: NavItem[] } {
  const base = "/admin";
  const ic = (k: string) => ICONS[k];
  return {
    overview: [{ href: `${base}/dashboard`, label: "Dashboard", icon: ic("dashboard") }],
    management: [
      { href: `${base}/clients`, label: "Clients", icon: ic("clients") },
      { href: `${base}/tax-filings`, label: "Tax Filings", icon: ic("filings") },
      { href: `${base}/tasks`, label: "Task Management", icon: ic("tasks") },
      { href: `${base}/documents`, label: "Documents", icon: ic("documents") },
      { href: `${base}/messages`, label: "Messages", icon: ic("messages") },
      { href: `${base}/audit`, label: "Audit Trail", icon: ic("audit") },
    ],
    finance: [
      { href: `${base}/payments`, label: "Payments", icon: ic("payments") },
      { href: `${base}/team`, label: "Team & Performance", icon: ic("team") },
      { href: `${base}/performance`, label: "My Performance", icon: ic("performance") },
      { href: `${base}/reports`, label: "Reports & Analytics", icon: ic("reports") },
    ],
    support: [
      { href: `${base}/settings`, label: "Settings", icon: ic("settings") },
      { href: `${base}/help`, label: "Help & Support", icon: ic("help") },
      { href: `${base}/escalations`, label: "Escalations", icon: ic("escalations") },
    ],
  };
}

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (pathname === href) return true;
  if (href.endsWith("/dashboard") && (pathname === "/admin" || pathname === "/admin/")) return true;
  return false;
}

function NavRow({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={`client-nav group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-bold ${
        active ? "active" : ""
      } ${collapsed ? "justify-center px-0" : ""}`}
      style={
        active
          ? { background: "var(--accent)", color: "#fff", boxShadow: "0 4px 14px color-mix(in srgb, var(--accent) 30%, transparent)" }
          : { color: "var(--text-2)" }
      }
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
        style={active ? { background: "rgba(255,255,255,.18)", color: "#fff" } : { background: "var(--surface-muted)", color: "var(--text-2)" }}
      >
        {item.icon}
      </span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {!collapsed && item.badge ? (
        <span
          className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
          style={{ background: item.badgeTone === "red" ? "#DC2626" : "var(--accent)" }}
        >
          {item.badge > 9 ? "9+" : item.badge}
        </span>
      ) : null}
      {!collapsed && active && <ChevronRight size={14} style={{ color: "rgba(255,255,255,.75)" }} />}
      {collapsed && item.badge ? (
        <span
          className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
          style={{ background: item.badgeTone === "red" ? "#DC2626" : "var(--accent)", boxShadow: "0 0 0 2px var(--surface)" }}
        >
          {item.badge > 9 ? "9+" : item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow px-3 pb-1.5 pt-4 font-bold">{children}</p>;
}

export function AdminSidebar({
  name,
  pathname,
  menuWithBadges,
  support,
  collapsed,
  onToggleCollapse,
  onLogout,
}: {
  name: string;
  pathname: string | null;
  menuWithBadges: NavItem[];
  support: NavItem[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLogout: () => void;
}) {
  const byHref = new Map([...menuWithBadges, ...support].map((i) => [i.href, i]));
  const pick = (href: string, fallback: NavItem) => byHref.get(href) ?? fallback;
  const groups = adminNav();
  const overview = groups.overview.map((g) => pick(g.href, g));
  const management = groups.management.map((g) => pick(g.href, g));
  const finance = groups.finance.map((g) => pick(g.href, g));
  const supportItems = groups.support.map((g) => pick(g.href, g));

  return (
    <aside
      aria-label="Admin navigation"
      className="client-side client-side-light sticky top-0 hidden h-screen shrink-0 flex-col md:flex"
      style={{
        width: collapsed ? 84 : 280,
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--border)",
        transition: "width 220ms cubic-bezier(.22,1,.36,1)",
      }}
    >
      <div className={`flex items-center gap-2 px-4 ${collapsed ? "flex-col justify-center px-0 py-3" : "h-16"}`}>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
          style={{ background: "var(--accent)" }}
        >
          T
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-none" style={{ color: "var(--text)" }}>TaxDesk</p>
            <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--text-2)" }}>
              FilePilot OS · Admin
            </p>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="btn-ghost p-2"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3" style={{ scrollbarWidth: "thin" }}>
        <nav className="space-y-1" aria-label="Overview">
          {!collapsed && <SectionLabel>Overview</SectionLabel>}
          {overview.map((item) => (
            <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
          ))}
        </nav>
        <nav className="space-y-1" aria-label="Management">
          {!collapsed && <SectionLabel>Management</SectionLabel>}
          {management.map((item) => (
            <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
          ))}
        </nav>
        <nav className="space-y-1" aria-label="Finance">
          {!collapsed && <SectionLabel>Finance & team</SectionLabel>}
          {finance.map((item) => (
            <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
          ))}
        </nav>
        <nav className="space-y-1" aria-label="Support">
          {!collapsed && <SectionLabel>Support</SectionLabel>}
          {supportItems.map((item) => (
            <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
          ))}
        </nav>

        {!collapsed && (
          <div
            className="mt-5 rounded-2xl p-4"
            style={{ background: "var(--surface-muted)", border: "1px solid var(--border)" }}
          >
            <p className="text-[13px] font-bold leading-snug" style={{ color: "var(--text)" }}>Pending approvals?</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>Review and approve new team & client requests.</p>
            <Link
              href="/admin/team"
              className="mt-3 block rounded-xl px-3 py-2 text-center text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--accent)" }}
            >
              Open approvals
            </Link>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t p-3" style={{ borderColor: "var(--border)" }}>
        <div className={`flex items-center gap-2.5 ${collapsed ? "flex-col" : ""}`}>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: "var(--accent)" }}
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold" style={{ color: "var(--text)" }}>{name}</p>
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide" style={{ background: "#DCFCE7", color: "#16A34A" }}>
                <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "#16A34A", boxShadow: "0 0 8px rgba(34,197,94,.9)" }} />
                Online
              </span>
            </div>
          )}
          {!collapsed && (
            <button onClick={onLogout} className="btn-ghost p-2" aria-label="Logout" title="Logout">
              <LogOut size={15} />
            </button>
          )}
        </div>
        <div className={`flex items-center ${collapsed ? "justify-center" : ""}`}>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

export function AdminMobileSidebar({
  name,
  pathname,
  menuWithBadges,
  support,
  onClose,
  onLogout,
}: {
  name: string;
  pathname: string | null;
  menuWithBadges: NavItem[];
  support: NavItem[];
  onClose: () => void;
  onLogout: () => void;
}) {
  const all = [...menuWithBadges, ...support];
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        className="client-side client-side-light absolute left-0 top-0 flex h-full w-[300px] flex-col"
        style={{ background: "var(--surface)", borderRight: "1px solid var(--border)", animation: "client-drawer 220ms cubic-bezier(.22,1,.36,1)" }}
        aria-label="Admin navigation mobile"
      >
        <div className="flex h-16 items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-white" style={{ background: "var(--accent)" }}>
            T
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-none" style={{ color: "var(--text)" }}>TaxDesk</p>
            <p className="mt-1 truncate text-[11px]" style={{ color: "var(--text-2)" }}>{name}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2" aria-label="Close menu">
            <X size={16} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {all.map((item) => (
            <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={false} onNavigate={onClose} />
          ))}
        </nav>
        <div className="flex items-center justify-between border-t p-4" style={{ borderColor: "var(--border)" }}>
          <ThemeToggle />
          <button onClick={onLogout} className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm">
            <LogOut size={14} /> Logout
          </button>
        </div>
      </aside>
    </div>
  );
}
