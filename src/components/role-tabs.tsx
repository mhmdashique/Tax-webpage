"use client";
import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Users, UserCheck, CheckCircle2, ArrowRight } from "lucide-react";

type RoleKey = "admin" | "employee" | "client";

const ROLES: Array<{
  key: RoleKey;
  tab: string;
  Icon: typeof ShieldCheck;
  title: string;
  d: string;
  li: string[];
}> = [
  {
    key: "admin",
    tab: "Admins",
    Icon: ShieldCheck,
    title: "The command center",
    d: "Firm-wide visibility, team workload, overdue heatmaps and exportable reports — run the whole practice from one screen.",
    li: ["Overdue radar", "Team capacity", "One-click exports"],
  },
  {
    key: "employee",
    tab: "Employees",
    Icon: Users,
    title: "Your focused workday",
    d: "Assigned clients, kanban tasks and scoped deadlines. Open TaxDesk and know exactly what to do today — nothing else.",
    li: ["My-day focus view", "Kanban filings", "Client messaging"],
  },
  {
    key: "client",
    tab: "Clients",
    Icon: UserCheck,
    title: "Effortless for clients",
    d: "Upload docs, e-sign and track filing status in plain language — from a phone, in under 2 minutes.",
    li: ["Guided checklists", "Mobile uploads", "Live status"],
  },
];

function AdminPreview() {
  return (
    <div>
      <div className="rounded-xl p-4 text-white" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-hover))" }}>
        <p className="text-xs opacity-80">Firm overview</p>
        <p className="mt-0.5 text-lg font-extrabold">128 active clients</p>
      </div>
      <div className="mt-3 space-y-2.5">
        {[
          ["Overdue filings", "2", "4%"],
          ["Due this week", "18", "38%"],
          ["Completed Q3", "96", "92%"],
        ].map(([l, v, w]) => (
          <div key={l}>
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>{l}</span>
              <span className="tnum">{v}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <div className="h-full rounded-full" style={{ width: w, background: "linear-gradient(90deg,var(--accent),#7C3AED)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmployeePreview() {
  return (
    <div className="space-y-2">
      {[
        ["Review VAT Q3 · Acme Ltd", "Due today", true],
        ["Chase payroll docs · North LLC", "Due Fri", false],
        ["Draft Corp Tax · Bright Co", "In progress", false],
      ].map(([t, d, hot]) => (
        <div
          key={t as string}
          className="flex items-center gap-3 rounded-xl border px-3.5 py-3"
          style={hot ? { borderColor: "var(--accent)", background: "var(--accent-tint)" } : { borderColor: "var(--border)", background: "var(--bg)" }}
        >
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
            style={hot ? { borderColor: "var(--accent)", background: "var(--accent)", color: "#fff", fontSize: 11 } : { borderColor: "var(--border)", color: "transparent", fontSize: 11 }}
          >
            ✓
          </span>
          <span>
            <span className="block text-[13px] font-bold">{t as string}</span>
            <span className="block text-[11px]" style={{ color: "var(--text-2)" }}>{d as string}</span>
          </span>
        </div>
      ))}
      <p className="pt-1 text-center text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>+ 9 more tasks scheduled</p>
    </div>
  );
}

function ClientPreview() {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold">
        <span>VAT Q3 checklist</span>
        <span style={{ color: "var(--text-2)" }}>2 of 3 done</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
        <div className="h-full w-2/3 rounded-full" style={{ background: "linear-gradient(90deg,var(--accent),#60A5FA)" }} />
      </div>
      <div className="mt-3 space-y-2 text-[13px] font-medium">
        {["Bank statements ✓", "Sales invoices ✓", "Expense receipts · upload"].map((t) => (
          <div key={t} className="flex items-center gap-2 rounded-xl border px-3.5 py-2.5" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <CheckCircle2 size={15} className={t.includes("upload") ? "" : "text-emerald-600"} style={t.includes("upload") ? { color: "var(--text-2)" } : undefined} />
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RoleTabs() {
  const [active, setActive] = useState<RoleKey>("admin");
  const role = ROLES.find((r) => r.key === active) ?? ROLES[0];

  return (
    <div className="mt-10">
      <div role="tablist" aria-label="Workspaces by role" className="mx-auto flex w-full max-w-2xl items-center gap-1 rounded-2xl border p-1.5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {ROLES.map(({ key, tab, Icon }) => {
          const selected = key === active;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(key)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-bold transition-all"
              style={
                selected
                  ? { background: "linear-gradient(120deg,var(--accent),#6D28D9)", color: "#fff", boxShadow: "0 6px 18px color-mix(in srgb, var(--accent) 35%, transparent)" }
                  : { color: "var(--text-2)" }
              }
            >
              <Icon size={17} /> {tab}
            </button>
          );
        })}
      </div>

      <div key={role.key} className="mx-auto mt-6 grid max-w-5xl gap-6 overflow-hidden rounded-[32px] border p-7 md:grid-cols-2 md:p-12" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div>
          <p className="eyebrow">For {role.tab.toLowerCase()}</p>
          <h3 className="mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">{role.title}</h3>
          <p className="mt-3 text-[15px] leading-relaxed md:text-base" style={{ color: "var(--text-2)" }}>{role.d}</p>
          <ul className="mt-6 space-y-2.5 text-[15px] font-medium">
            {role.li.map((x) => (
              <li key={x} className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /> {x}</li>
            ))}
          </ul>
          <Link href="/signup" className="btn-primary mt-8 inline-flex items-center gap-2 px-6 py-3 text-[15px]">
            Get started <ArrowRight size={16} />
          </Link>
        </div>
        <div className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
          <p className="eyebrow mb-3">Preview · {role.tab} workspace</p>
          {role.key === "admin" && <AdminPreview />}
          {role.key === "employee" && <EmployeePreview />}
          {role.key === "client" && <ClientPreview />}
        </div>
      </div>
    </div>
  );
}
