"use client";
import React from "react";
import { useTheme } from "./theme-provider";
import { Moon, Sun, X } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  // Render the light-mode icon on server + first paint so SSR HTML matches
  // the client; swap to the real icon only after mount (avoids hydration mismatch).
  const dark = mounted && resolved === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to night mode"}
      title={dark ? "Switch to light mode" : "Switch to night mode"}
      className={`btn-ghost inline-flex h-9 w-9 items-center justify-center ${className}`}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const base =
    variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-primary" : "btn-ghost";
  const danger = variant === "danger" ? { background: "#DC2626" } as React.CSSProperties : undefined;
  return (
    <button {...rest} style={danger} className={`${base} inline-flex items-center justify-center gap-2 px-4 py-2.5 ${className}`}>
      {children}
    </button>
  );
}

export function Card({ children, className = "", hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div
      className={`card p-5 ${hover ? "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg" : ""} ${className}`}
      style={hover ? { transition: "all 200ms ease-out" } : undefined}
      onMouseEnter={(e) => {
        if (hover) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        if (hover) (e.currentTarget as HTMLDivElement).style.borderColor = "";
      }}
    >
      {children}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "success" | "warning" | "danger" | "accent" | "neutral"; children: React.ReactNode }) {
  const map: Record<string, React.CSSProperties> = {
    success: { background: "var(--success-bg)", color: "var(--success-tx)" },
    warning: { background: "var(--warn-bg)", color: "var(--warn-tx)" },
    danger: { background: "var(--danger-bg)", color: "var(--danger-tx)" },
    accent: { background: "var(--accent-tint)", color: "var(--accent-hover)" },
    neutral: { background: "color-mix(in srgb, var(--text-2) 15%, transparent)", color: "var(--text)" },
  };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.02em]"
      style={map[tone]}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): "success" | "warning" | "danger" | "accent" | "neutral" {
  const s = status.toLowerCase().replace(/ /g, "_");
  if (["completed", "filed", "paid", "done", "verified", "active"].includes(s)) return "success";
  if (["overdue", "at-risk", "at_risk", "failed", "escalated"].includes(s)) return "danger";
  if (["documents_requested", "client_review", "in_preparation", "documents_received", "pending", "due soon", "due_soon", "in_progress", "in review", "open", "created"].includes(s)) return "warning";
  return "accent";
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status.replace(/_/g, " ")}</Badge>;
}

export function EmptyState({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>
        {icon}
      </div>
      <p className="text-sm" style={{ color: "var(--text-2)" }}>{title}</p>
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, size = "md" }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: "md" | "xl" }) {
  const titleId = React.useId();
  React.useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;
  const wide = size === "xl";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button type="button" className="absolute inset-0 bg-slate-950/60 backdrop-blur-[3px]" onClick={onClose} aria-label="Close dialog" />
      <div
        className="relative flex w-full flex-col overflow-hidden rounded-2xl border shadow-2xl sm:rounded-3xl"
        style={{
          background: "var(--surface-elev)",
          borderColor: "var(--border)",
          maxWidth: wide ? 960 : 560,
          maxHeight: "min( calc(100dvh - 2rem), 900px )",
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b px-5 py-4 sm:px-7 sm:py-5" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <h3 id={titleId} className="truncate text-base font-bold tracking-tight sm:text-lg">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors hover:text-[var(--accent)]"
            style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto ${wide ? "p-5 sm:p-7" : "p-5 sm:p-6"}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, trend, spark, icon }: { label: string; value: string; trend?: string; trendUp?: boolean; spark?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">{label}</p>
          <p className="tnum mt-2 text-[30px] font-bold leading-none">{value}</p>
          {trend ? (
            <p className="mt-2 text-xs font-medium" style={{ color: trend.startsWith("-") ? "#DC2626" : "var(--accent)" }}>{trend}</p>
          ) : null}
        </div>
        {icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px]" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>
            {icon}
          </div>
        ) : null}
      </div>
      {spark ? <div className="mt-3">{spark}</div> : null}
    </Card>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
              style={{
                background: i < current ? "var(--accent)" : i === current ? "var(--accent)" : "color-mix(in srgb, var(--text-2) 20%, transparent)",
                color: i <= current ? "#fff" : "var(--text-2)",
                boxShadow: i === current ? "0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent)" : undefined,
              }}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span className="text-[11px] font-medium" style={{ color: "var(--text-2)" }}>{s}</span>
          </div>
          {i < steps.length - 1 && (
            <div className="mx-2 mb-6 h-0.5 flex-1 rounded" style={{ background: i < current ? "var(--accent)" : "var(--border)" }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function DataTable({ columns, rows, onRowClick, emptyText = "No records yet" }: { columns: string[]; rows: React.ReactNode[][]; onRowClick?: (rowIndex: number) => void; emptyText?: string }) {
  if (!rows.length) return <p className="py-8 text-center text-sm" style={{ color: "var(--text-2)" }}>{emptyText}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0">
          <tr className="eyebrow text-left">
            {columns.map((c) => (
              <th key={c} className="px-3 py-3 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} onClick={() => onRowClick?.(i)} className={`border-t transition-colors ${onRowClick ? "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5" : "row-hover"}`} style={{ height: 56 }}>
              {r.map((cell, j) => (
                <td key={j} className="tnum px-3 py-2">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Sparkline({ points, color = "var(--accent)" }: { points: number[]; color?: string }) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const w = 120, h = 40;
  const path = points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * w;
    const y = h - 4 - ((p - min) / Math.max(max - min, 1)) * (h - 8);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
