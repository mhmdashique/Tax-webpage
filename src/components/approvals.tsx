"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Card, EmptyState, Badge, Modal } from "./ui";
import { createClient } from "@/lib/supabase/client";
import { Inbox } from "lucide-react";

export interface ApprovalUser {
  id: string;
  name: string;
  email: string;
  role: string;
  requested_role: string | null;
  approval_status: string;
  rejected_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}

type Status = "pending" | "approved" | "rejected";

async function fetcher(url: string) {
  const r = await fetch(url);
  const j = (await r.json().catch(() => ({}))) as { data?: ApprovalUser[]; error?: string };
  if (!r.ok) throw new Error(j.error ?? "Could not load requests");
  return (j.data ?? []) as ApprovalUser[];
}

function roleOf(u: ApprovalUser) {
  return (u.requested_role ?? u.role ?? "client") as "employee" | "client";
}

type Client = NonNullable<ReturnType<typeof createClient>>;

/** Drop stale same-topic channels before subscribing. supabase-js reuses
 *  channel objects by topic across mounts (StrictMode / HMR remounts) and
 *  realtime-js throws if .on() is called on an already-subscribed channel. */
function dropStaleChannels(sb: Client, topic: string) {
  for (const c of sb.getChannels()) {
    if (c.topic === topic || c.topic.endsWith(`:${topic}`)) {
      void sb.removeChannel(c);
    }
  }
}

/** Live list of approval requests for one status tab (Realtime-aware). */
export function useApprovals(status: Status) {
  const swr = useSWR<ApprovalUser[]>(`/api/admin/approvals?status=${status}`, fetcher);
  useEffect(() => {
    const sb = createClient();
    if (!sb) return;
    const topic = `approvals-${status}`;
    dropStaleChannels(sb, topic);
    const ch = sb
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, () => {
        swr.mutate();
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  return swr;
}

/** Live pending-request count (sidebar badge, notification bell). Admin only. */
export function usePendingCount(enabled: boolean) {
  const { data } = useSWR<ApprovalUser[]>(
    enabled ? "/api/admin/approvals?status=pending" : null,
    fetcher,
    { refreshInterval: 30000 }
  );
  const [liveBump, setLiveBump] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const sb = createClient();
    if (!sb) return;
    const topic = "pending-count";
    dropStaleChannels(sb, topic);
    const ch = sb
      .channel(topic)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "users" }, () => {
        setLiveBump((b) => b + 1);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users" }, () => {
        setLiveBump((b) => b + 1);
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [enabled]);
  void liveBump;
  return data?.length ?? 0;
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: "#2563EB" }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function RoleChip({ role }: { role: string }) {
  return (
    <Badge tone={role === "employee" ? "success" : "accent"}>
      {role === "employee" ? "Employee" : "Client"}
    </Badge>
  );
}

/**
 * Accept / Reject / Re-approve / Revoke buttons for one user, shared by the
 * Pending Requests cards and the Team table. Reports errors via `notify` —
 * success is only reported after the API confirms the persisted update.
 */
export function ApprovalActionButtons({
  u,
  onChanged,
  notify,
  allowRevoke = false,
}: {
  u: ApprovalUser;
  onChanged: () => void;
  notify: (msg: string, ok: boolean) => void;
  allowRevoke?: boolean;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function approve() {
    setBusy("approve");
    try {
      const r = await fetch(`/api/admin/approvals/${u.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = (await r.json().catch(() => ({}))) as { error?: string; emailConfirmWarning?: string | null };
      if (!r.ok) throw new Error(j.error ?? "Approve failed");
      if (j.emailConfirmWarning) {
        notify(`✓ ${u.email} approved, but email confirm failed (${j.emailConfirmWarning}) — login may still fail`, false);
      } else {
        notify(`✓ ${u.email} approved`, true);
      }
      onChanged();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Approve failed", false);
    } finally {
      setBusy(null);
    }
  }

  async function reject(withReason?: string) {
    setBusy("reject");
    try {
      const r = await fetch(`/api/admin/approvals/${u.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: withReason ?? (reason.trim() || undefined) }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Reject failed");
      setRejectOpen(false);
      setReason("");
      notify(withReason ? `Access revoked for ${u.email}` : `Rejected ${u.email}`, true);
      onChanged();
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : "Reject failed", false);
    } finally {
      setBusy(null);
    }
  }

  function revoke() {
    if (!window.confirm(`Revoke access for ${u.email}? They will be signed out of the app immediately.`)) return;
    void reject("Access revoked by admin");
  }

  if (u.approval_status === "pending") {
    return (
      <>
        <button
          onClick={approve}
          disabled={busy !== null}
          className="rounded-[10px] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          style={{ background: "#2563EB" }}
        >
          {busy === "approve" ? "Accepting…" : "Accept"}
        </button>
        <button
          onClick={() => setRejectOpen(true)}
          disabled={busy !== null}
          className="rounded-[10px] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          style={{ background: "#DC2626" }}
        >
          Reject
        </button>
        <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title={`Reject ${u.email}?`}>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            They will see “Your request was not approved” and cannot log in. You can re-approve them later from the Rejected tab.
          </p>
          <label className="mt-3 block text-sm font-medium">
            Reason (optional)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Could not verify employment…"
              className="mt-1 w-full rounded-[10px] border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setRejectOpen(false)} className="btn-ghost rounded-[10px] px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <button
              onClick={() => reject()}
              disabled={busy !== null}
              className="rounded-[10px] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "#DC2626" }}
            >
              {busy === "reject" ? "Rejecting…" : "Reject request"}
            </button>
          </div>
        </Modal>
      </>
    );
  }

  if (u.approval_status === "rejected") {
    return (
      <button
        onClick={approve}
        disabled={busy !== null}
        className="btn-ghost rounded-[10px] px-3 py-1.5 text-xs font-bold disabled:opacity-50"
      >
        {busy === "approve" ? "Approving…" : "Re-approve"}
      </button>
    );
  }

  if (allowRevoke && u.role !== "admin") {
    return (
      <button
        onClick={revoke}
        disabled={busy !== null}
        className="btn-ghost rounded-[10px] px-3 py-1.5 text-xs font-bold disabled:opacity-50"
        title="Revoke this user's access immediately"
      >
        {busy === "reject" ? "Revoking…" : "Revoke"}
      </button>
    );
  }

  return null;
}

/** One request row with Accept / Reject actions + optimistic updates. */
function RequestRow({
  u,
  onChanged,
  notify,
}: {
  u: ApprovalUser;
  onChanged: () => void;
  notify: (msg: string, ok: boolean) => void;
}) {
  const [gone, setGone] = useState(false);

  if (gone) return null;

  const pending = u.approval_status === "pending";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
      <Avatar name={u.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{u.name}</p>
        <p className="truncate text-xs" style={{ color: "var(--text-2)" }}>{u.email}</p>
      </div>
      <RoleChip role={roleOf(u)} />
      <span className="hidden text-xs sm:inline" style={{ color: "var(--text-2)" }}>
        {new Date(u.created_at).toLocaleDateString()}
      </span>
      {pending || u.approval_status === "rejected" ? (
        <ApprovalActionButtons
          u={u}
          onChanged={() => { setGone(true); onChanged(); }}
          notify={notify}
        />
      ) : (
        <Badge tone="success">Approved</Badge>
      )}
    </div>
  );
}

/** Full approval manager: Pending / Approved / Rejected tabs + search. */
export function ApprovalManager({ compact = false }: { compact?: boolean }) {
  const [tab, setTab] = useState<Status>("pending");
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [diagEmail, setDiagEmail] = useState("");
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagErr, setDiagErr] = useState<string | null>(null);
  const [diag, setDiag] = useState<{
    verdict: string;
    migrationOk: boolean;
    adminFirm: string;
    authUser: { id: string; emailConfirmed: boolean } | null;
    profiles: {
      id: string; email: string; name: string; role: string;
      requested_role: string | null; approval_status: string;
      firm_id: string | null; created_at: string;
      approved_by: string | null; approved_at: string | null;
    }[];
  } | null>(null);
  const { data = [], isLoading, error, mutate } = useApprovals(tab);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data;
    return data.filter(
      (u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
    );
  }, [data, q]);

  // Repair: pull auth users that never got a profile row into the queue.
  // (Fixes sign-ups from before the approval layer existed.)
  async function syncSignups() {
    setSyncing(true);
    try {
      const r = await fetch("/api/admin/approvals/sync", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { error?: string; synced?: number; adopted?: number };
      if (!r.ok) throw new Error(j.error ?? "Sync failed");
      const total = (j.synced ?? 0) + (j.adopted ?? 0);
      if (total > 0) {
        setToast({ msg: `✓ ${total} signup${total === 1 ? "" : "s"} pulled into the queue`, ok: true });
      } else {
        setToast({ msg: "No missing signups found — the queue is complete.", ok: true });
      }
      mutate();
    } catch (e: unknown) {
      setToast({ msg: e instanceof Error ? e.message : "Sync failed", ok: false });
    } finally {
      setSyncing(false);
    }
  }

  const loadError = error ? (error as Error).message ?? "Could not load requests" : null;

  // Explain why ONE address does / doesn't appear in the queue.
  async function diagnose() {
    const email = diagEmail.trim();
    if (!email) return;
    setDiagLoading(true);
    setDiagErr(null);
    setDiag(null);
    try {
      const r = await fetch(`/api/admin/approvals/sync?email=${encodeURIComponent(email)}`);
      const j = (await r.json().catch(() => ({}))) as {
        error?: string;
        verdict?: string;
        migrationOk?: boolean;
        adminFirm?: string;
        authUser?: { id: string; emailConfirmed: boolean } | null;
        profiles?: {
          id: string; email: string; name: string; role: string;
          requested_role: string | null; approval_status: string;
          firm_id: string | null; created_at: string;
          approved_by: string | null; approved_at: string | null;
        }[];
      };
      if (!r.ok) throw new Error(j.error ?? "Diagnose failed");
      setDiag({
        verdict: j.verdict ?? "No verdict",
        migrationOk: j.migrationOk ?? true,
        adminFirm: j.adminFirm ?? "",
        authUser: j.authUser ?? null,
        profiles: j.profiles ?? [],
      });
    } catch (e: unknown) {
      setDiagErr(e instanceof Error ? e.message : "Diagnose failed");
    } finally {
      setDiagLoading(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Pending Requests</h2>
        <ApprovalCountBadge />
        <button
          onClick={syncSignups}
          disabled={syncing}
          className="btn-ghost rounded-[10px] px-3 py-1.5 text-xs font-bold disabled:opacity-50"
          title="Pull any confirmed sign-ups that are missing from the queue into Pending"
        >
          {syncing ? "Syncing…" : "Sync signups"}
        </button>
        {!compact && (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email…"
            className="ml-auto w-full rounded-[10px] border px-3 py-1.5 text-sm outline-none sm:w-56"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          />
        )}
      </div>
      <div className="mb-3 flex gap-2">
        {(["pending", "approved", "rejected"] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize ${tab === s ? "text-white" : ""}`}
            style={tab === s ? { background: "#2563EB" } : { border: "1px solid var(--border)" }}
          >
            {s}
          </button>
        ))}
      </div>
      {toast && (
        <p
          className="mb-3 rounded-xl px-4 py-2 text-xs font-semibold"
          style={toast.ok ? { background: "var(--success-bg)", color: "var(--success-tx)" } : { background: "var(--danger-bg)", color: "var(--danger-tx)" }}
        >
          {toast.msg}
        </p>
      )}
      {isLoading ? (
        <div className="skeleton h-24" />
      ) : loadError ? (
        <div className="rounded-[10px] border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
          <p className="font-semibold" style={{ color: "#DC2626" }}>Couldn&apos;t load requests</p>
          <p className="mt-1" style={{ color: "var(--text-2)" }}>{loadError}</p>
          <button onClick={() => mutate()} className="btn-ghost mt-3 rounded-[10px] px-4 py-2 text-xs font-bold">
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        tab === "pending" ? (
          <EmptyState icon={<Inbox size={22} />} title="No pending requests" />
        ) : (
          <p className="py-8 text-center text-sm" style={{ color: "var(--text-2)" }}>
            No {tab} requests.
          </p>
        )
      ) : (
        <div className="space-y-2">
          {rows.map((u) => (
            <RequestRow key={u.id} u={u} onChanged={() => mutate()} notify={(msg, ok) => setToast({ msg, ok })} />
          ))}
        </div>
      )}
      <details className="mt-3 rounded-[10px] border px-3 py-2" style={{ borderColor: "var(--border)" }}>
        <summary className="cursor-pointer text-xs font-bold" style={{ color: "var(--text-2)" }}>
          Missing a request? Diagnose by email
        </summary>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={diagEmail}
            onChange={(e) => setDiagEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") diagnose(); }}
            placeholder="user@example.com"
            className="flex-1 rounded-[10px] border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          />
          <button
            onClick={diagnose}
            disabled={diagLoading || !diagEmail.trim()}
            className="rounded-[10px] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "#2563EB" }}
          >
            {diagLoading ? "Checking…" : "Diagnose"}
          </button>
        </div>
        {diagErr && (
          <p className="mt-2 text-xs font-semibold" style={{ color: "#DC2626" }}>{diagErr}</p>
        )}
        {diag && (
          <div className="mt-2 rounded-[10px] p-3 text-xs" style={{ background: "var(--bg)" }}>
            <p className="font-semibold">{diag.verdict}</p>
            <ul className="mt-2 space-y-1" style={{ color: "var(--text-2)" }}>
              <li>Approval columns: {diag.migrationOk ? "present ✓" : "MISSING ✗ — apply migrations 0008/0009"}</li>
              <li>
                Auth account: {diag.authUser
                  ? `exists, email ${diag.authUser.emailConfirmed ? "confirmed ✓" : "NOT confirmed"}`
                  : "none in this project"}
              </li>
              {diag.profiles.map((p) => (
                <li key={p.id}>
                  Queue row: {p.approval_status} · role {p.role} (requested {p.requested_role ?? "—"}) ·{" "}
                  {p.firm_id === null ? "no firm" : p.firm_id === diag.adminFirm ? "your firm ✓" : "a DIFFERENT firm"} ·{" "}
                  {new Date(p.created_at).toLocaleString()}
                  {p.approval_status === "approved" && (
                    <> · approved {p.approved_at ? new Date(p.approved_at).toLocaleString() : "(no timestamp — re-approve to repair)"}</>
                  )}
                </li>
              ))}
              {diag.profiles.length === 0 && <li>Queue rows: none</li>}
            </ul>
          </div>
        )}
      </details>
    </Card>
  );
}

/** Count badge used next to section titles. */
export function ApprovalCountBadge() {
  const { data = [] } = useApprovals("pending");
  if (data.length === 0) return null;
  return (
    <span
      className="inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
      style={{ background: "#2563EB" }}
      aria-label={`${data.length} pending requests`}
    >
      {data.length}
    </span>
  );
}

/** Compact card for the Performance page with a link to the Team page. */
export function PendingApprovalsCard() {
  const { data = [], isLoading, mutate } = useApprovals("pending");
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-semibold">Pending approvals</h2>
        <ApprovalCountBadge />
        <Link href="/admin/team" className="ml-auto text-xs font-bold text-[#2563EB] hover:underline">
          Open Team page →
        </Link>
      </div>
      {toast && (
        <p className="mb-3 rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}>
          {toast}
        </p>
      )}
      {isLoading ? (
        <div className="skeleton h-20" />
      ) : data.length === 0 ? (
        <EmptyState icon={<Inbox size={22} />} title="No pending requests" />
      ) : (
        <div className="space-y-2">
          {data.slice(0, 5).map((u) => (
            <RequestRow key={u.id} u={u} onChanged={() => mutate()} notify={(msg) => setToast(msg)} />
          ))}
          {data.length > 5 && (
            <p className="text-center text-xs" style={{ color: "var(--text-2)" }}>
              +{data.length - 5} more — <Link href="/admin/team" className="font-bold text-[#2563EB] hover:underline">view all</Link>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
