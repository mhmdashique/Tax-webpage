"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  History, Search, Download, FileText, CheckSquare, FolderOpen,
  CreditCard, Users, MessagesSquare, Activity as ActivityIcon, ChevronDown,
} from "lucide-react";
import { Badge, EmptyState, Button } from "./ui";
import { PremCard } from "./premium-theme";
import { createClient } from "@/lib/supabase/client";
import { toCSV, downloadFile } from "@/lib/data";
import { humanizeAction, actorDisplayName, buildDocUploader } from "@/lib/audit";
import { useUsers, useDocuments, useClients } from "@/lib/hooks";
import type { ActivityItem } from "@/types/database";

const PAGE_SIZE = 60;

function useAuditLog() {
  return useSWR<ActivityItem[]>("audit-trail-full", async () => {
    const sb = createClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as ActivityItem[];
  });
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - +new Date(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yest)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function visualFor(entity: string): { icon: React.ReactNode; bg: string; fg: string } {
  const e = entity.toLowerCase();
  if (e.includes("fil")) return { icon: <FileText size={15} />, bg: "var(--accent-tint)", fg: "var(--accent)" };
  if (e.includes("task")) return { icon: <CheckSquare size={15} />, bg: "#E0F2FE", fg: "#0284C7" };
  if (e.includes("doc")) return { icon: <FolderOpen size={15} />, bg: "#FEF3C7", fg: "#B45309" };
  if (e.includes("pay") || e.includes("invo")) return { icon: <CreditCard size={15} />, bg: "#DCFCE7", fg: "#16A34A" };
  if (e.includes("user") || e.includes("approv") || e.includes("client")) return { icon: <Users size={15} />, bg: "#EDE9FE", fg: "#7C3AED" };
  if (e.includes("mess") || e.includes("ticket") || e.includes("escal")) return { icon: <MessagesSquare size={15} />, bg: "#FCE7F3", fg: "#DB2777" };
  return { icon: <ActivityIcon size={15} />, bg: "var(--surface-muted)", fg: "var(--text-2)" };
}

export function useAuditFacts() {
  const { data: rows = [] } = useAuditLog();
  return useMemo(() => {
    const now = Date.now();
    const today = rows.filter((r) => now - +new Date(r.created_at) < 864e5).length;
    const actors = new Set(rows.map((r) => r.actor_name ?? "?")).size;
    const types = new Set(rows.map((r) => String(r.entity_type ?? "other"))).size;
    return { rows, total: rows.length, today, actors, types };
  }, [rows]);
}

export function AuditTrailView() {
  const { data: rows = [], isLoading, error, mutate } = useAuditLog();
  const { data: users = [] } = useUsers();
  const { data: docs = [] } = useDocuments();
  const { data: clients = [] } = useClients();
  const namesById = useMemo(
    () => new Map(users.map((u) => [u.id, u.name] as [string, string])),
    [users]
  );
  const docUploader = useMemo(
    () => buildDocUploader(docs, clients, namesById),
    [docs, clients, namesById]
  );
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [range, setRange] = useState<"all" | "24h" | "7d" | "30d">("all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const types = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const t = String(r.entity_type ?? "other");
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff = range === "all" ? 0 : Date.now() - (range === "24h" ? 864e5 : range === "7d" ? 7 * 864e5 : 30 * 864e5);
    return rows.filter((r) => {
      if (cutoff && +new Date(r.created_at) < cutoff) return false;
      if (typeFilter !== "all" && String(r.entity_type ?? "other") !== typeFilter) return false;
      if (q && !`${actorDisplayName(r, namesById, docUploader)} ${humanizeAction(r.action)} ${r.entity_type ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, typeFilter, range, namesById, docUploader]);

  const shown = filtered.slice(0, visible);

  const groups = useMemo(() => {
    const out: { day: string; items: ActivityItem[] }[] = [];
    for (const r of shown) {
      const day = dayKey(r.created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(r);
      else out.push({ day, items: [r] });
    }
    return out;
  }, [shown]);

  function reset() {
    setQuery("");
    setTypeFilter("all");
    setRange("all");
    setVisible(PAGE_SIZE);
  }

  const filtersActive = query.trim() !== "" || typeFilter !== "all" || range !== "all";

  return (
    <div className="space-y-4">
      <PremCard
        title="Filters"
        sub={`${filtered.length} of ${rows.length} events · newest first`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => downloadFile("taxdesk-audit-trail.csv", toCSV(filtered as unknown as Record<string, unknown>[]))}
              disabled={filtered.length === 0}
            >
              <Download size={14} /> Export CSV
            </Button>
            <Button variant="ghost" onClick={() => mutate()}>Refresh</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-2)" }} />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
                placeholder="Search actor, action or entity…"
                className="w-full rounded-[10px] border py-2.5 pl-9 pr-3 text-sm outline-none"
                style={{ borderColor: "var(--border)", background: "var(--bg)" }}
              />
            </label>
            <select
              value={range}
              onChange={(e) => { setRange(e.target.value as typeof range); setVisible(PAGE_SIZE); }}
              className="rounded-[10px] border px-3 py-2.5 text-sm font-semibold"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
              aria-label="Filter by date range"
            >
              <option value="all">All time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Entity filter">
            <button
              role="tab" aria-selected={typeFilter === "all"}
              onClick={() => { setTypeFilter("all"); setVisible(PAGE_SIZE); }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${typeFilter === "all" ? "text-white" : ""}`}
              style={typeFilter === "all" ? { background: "var(--accent)" } : { background: "var(--bg)", border: "1px solid var(--border)" }}
            >
              All · {rows.length}
            </button>
            {types.map(([t, n]) => (
              <button
                key={t} role="tab" aria-selected={typeFilter === t}
                onClick={() => { setTypeFilter(t); setVisible(PAGE_SIZE); }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold capitalize ${typeFilter === t ? "text-white" : ""}`}
                style={typeFilter === t ? { background: "var(--accent)" } : { background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                {t} · {n}
              </button>
            ))}
            {filtersActive && (
              <button onClick={reset} className="ml-auto text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>
                Reset filters
              </button>
            )}
          </div>
        </div>
      </PremCard>

      <PremCard title="Event log" sub={groups.length ? "Grouped by day · actor, action and timestamp" : "Every audited action, newest first"}>
        {isLoading ? (
          <div className="skeleton h-48" />
        ) : error ? (
          <EmptyState
            icon={<History size={22} />}
            title="Could not load the audit trail"
            action={<Button variant="ghost" onClick={() => mutate()}>Try again</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<History size={22} />}
            title={filtersActive ? "No events match these filters" : "No audited events yet — actions appear here as they happen"}
            action={filtersActive ? <button onClick={reset} className="text-xs font-bold hover:underline" style={{ color: "var(--accent)" }}>Reset filters</button> : undefined}
          />
        ) : (
          <>
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.day}>
                  <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-2)" }}>
                    {g.day}
                    <span className="tnum rounded-full px-2 py-0.5" style={{ background: "var(--surface-muted)" }}>{g.items.length}</span>
                  </p>
                  <div className="relative space-y-0">
                    <div aria-hidden className="absolute bottom-2 left-[22px] top-2 w-px" style={{ background: "var(--border)" }} />
                    {g.items.map((a) => {
                      const v = visualFor(String(a.entity_type ?? ""));
                      const who = actorDisplayName(a, namesById, docUploader);
                      const initial = String(who ?? "?").trim().charAt(0).toUpperCase() || "?";
                      return (
                        <div key={a.id} className="relative flex items-start gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-black/[0.02]">
                          <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2" style={{ background: v.bg, color: v.fg, borderColor: "var(--surface)" }}>
                            {v.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--accent)" }}>{initial}</span>
                              <p className="min-w-0 flex-1 truncate text-[13px]">
                                <span className="font-bold">{who}</span>{" "}
                                <span style={{ color: "var(--text-2)" }}>{humanizeAction(a.action)}</span>
                              </p>
                              <Badge tone="neutral">{String(a.entity_type ?? "other")}</Badge>
                            </div>
                            <p className="mt-1 pl-7 text-[11px]" style={{ color: "var(--text-2)" }}>
                              {timeAgo(a.created_at)} · {new Date(a.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              {a.entity_id ? ` · ${String(a.entity_id).slice(0, 8)}` : ""}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {visible < filtered.length && (
              <button
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="mt-4 flex w-full items-center justify-center gap-1 rounded-xl border py-2.5 text-xs font-bold transition-colors hover:bg-[var(--surface-muted)]"
                style={{ borderColor: "var(--border)", color: "var(--accent)" }}
              >
                Show more ({filtered.length - visible} remaining) <ChevronDown size={14} />
              </button>
            )}
          </>
        )}
      </PremCard>
      <p className="text-xs" style={{ color: "var(--text-2)" }}>
        Audit events are append-only — approvals, filing moves, uploads, payments and status changes are recorded automatically with actor and timestamp.
      </p>
    </div>
  );
}
