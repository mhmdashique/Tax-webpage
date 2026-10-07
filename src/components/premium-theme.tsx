"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTheme } from "./theme-provider";

/* Unified premium theme tokens — one clean language, three identities. */
export const PREMIUM = {
  admin: {
    primary: "#4F46E5",
    deep: "#1E1B4B",
    accent: "#F59E0B",
    soft: "#EEEDFE",
    accentSoft: "#FEF3C7",
    hero: "linear-gradient(120deg,#1E1B4B 0%,#4338CA 48%,#7C3AED 100%)",
    glow: "rgba(124,58,237,.35)",
    chart: ["#4F46E5", "#7C3AED", "#F59E0B", "#34D399", "#93C5FD", "#F87171"],
  },
  employee: {
    primary: "#0D9488",
    deep: "#042F2E",
    accent: "#F59E0B",
    soft: "#DDF5F1",
    accentSoft: "#FEF3C7",
    hero: "linear-gradient(120deg,#042F2E 0%,#0D9488 55%,#14B8A6 100%)",
    glow: "rgba(20,184,166,.35)",
    chart: ["#0D9488", "#14B8A6", "#F59E0B", "#4F46E5", "#5EEAD4", "#F87171"],
  },
  client: {
    primary: "#2563EB",
    deep: "#1E3A8A",
    accent: "#0284C7",
    soft: "#EFF6FF",
    accentSoft: "#E0F2FE",
    hero: "linear-gradient(180deg,#FFFFFF 0%,#EFF6FF 100%)",
    glow: "rgba(37,99,235,.10)",
    chart: ["#2563EB", "#38BDF8", "#F59E0B", "#34D399", "#93C5FD", "#F87171"],
  },
} as const;

export type PremiumRole = keyof typeof PREMIUM;

export const TOOLTIP = {
  background: "#101828",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 12px",
} as const;

export function PremHero({
  role, eyebrow, title, sub, stats, actions,
}: {
  role: PremiumRole; eyebrow: string; title: string; sub: string;
  stats: { v: string; l: string }[]; actions: ReactNode;
}) {
  const t = PREMIUM[role];
  const { resolved } = useTheme();
  const dark = resolved === "dark";
  const light = role === "client" && !dark;
  const heroStyle = light
    ? { background: t.hero, border: "1px solid var(--hero-border)", color: "var(--hero-text)" }
    : role === "client"
      ? { background: "var(--hero-bg)", border: "1px solid var(--hero-border)", color: "var(--hero-text)" }
      : { background: t.hero, color: "#fff" };
  const chipStyle = light
    ? { background: "var(--hero-chip-bg)", color: "var(--hero-chip-tx)" }
    : role === "client"
      ? { background: "var(--hero-chip-bg)", color: "var(--hero-chip-tx)" }
      : { background: "rgba(255,255,255,.16)" };
  const statStyle = light
    ? { background: "var(--hero-card-bg)", border: "1px solid var(--hero-border)" }
    : role === "client"
      ? { background: "var(--hero-card-bg)", border: "1px solid var(--hero-border)" }
      : { background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.15)" };
  const subColor = light || role === "client" ? "var(--hero-sub)" : "rgba(255,255,255,.85)";
  return (
    <section className="relative overflow-hidden rounded-2xl p-6 md:p-8" style={heroStyle}>
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full" style={{ background: `radial-gradient(closest-side,${t.glow},transparent)` }} />
      {!light && <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full" style={{ background: "radial-gradient(closest-side,rgba(255,255,255,.14),transparent)" }} />}
      <div className="relative grid items-center gap-6 lg:grid-cols-[1.4fr_.9fr]">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]" style={chipStyle}>{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-[34px]" style={{ fontFamily: "var(--font-fraunces),Georgia,serif" }}>{title}</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: subColor }}>{sub}</p>
          <div className="mt-5 flex flex-wrap gap-2">{actions}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.l} className="rounded-2xl px-2 py-4 text-center" style={statStyle}>
              <p className="tnum text-xl font-bold">{s.v}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] opacity-75">{s.l}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PremHead({ role, eyebrow, title, sub, actions }: { role: PremiumRole; eyebrow: string; title: string; sub: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: PREMIUM[role].accent === "#F59E0B" ? "#B45309" : PREMIUM[role].primary }}>{eyebrow}</p>
        <h1 className="prem-title mt-1">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--text-2)" }}>{sub}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PremKpi({ role, label, value, hint, icon, spark }: {
  role: PremiumRole; label: string; value: string; hint: string; icon: ReactNode; spark?: number[];
}) {
  const t = PREMIUM[role];
  const max = Math.max(...(spark ?? [1]), 1);
  return (
    <div className="card group p-5 transition-all duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className="tnum mt-2 truncate text-[26px] font-bold leading-none tracking-tight">{value}</p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>{hint}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105" style={{ background: t.soft, color: t.primary }}>{icon}</span>
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3 flex items-end gap-1" aria-hidden>
          {spark.map((v, i) => (
            <span key={i} className="w-full rounded-full" style={{ height: `${6 + (v / max) * 26}px`, background: i === spark.length - 1 ? t.primary : `${t.primary}22` }} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PremCard({ title, sub, action, children, className = "" }: {
  title: string; sub: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={`card flex min-w-0 flex-col p-5 ${className}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="prem-section">{title}</h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>{sub}</p>
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function PremBtn({ role, href, children, ghost = false }: { role: PremiumRole; href: string; children: ReactNode; ghost?: boolean }) {
  const t = PREMIUM[role];
  if (role === "client") {
    if (ghost)
      return <Link href={href} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors hover:bg-slate-50" style={{ borderColor: "#BFDBFE", color: t.primary }}>{children}</Link>;
    return <Link href={href} className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5" style={{ background: t.primary }}>{children}</Link>;
  }
  if (ghost)
    return <Link href={href} className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/10">{children}</Link>;
  return <Link href={href} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5" style={{ color: t.deep }}>{children}</Link>;
}
