import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Service-role client — SERVER ONLY. Bypasses RLS and can manage auth users.
 * Never import this file from a "use client" component. Requires
 * SUPABASE_SERVICE_ROLE_KEY in the server environment; returns null when
 * absent so routes can answer 503 instead of crashing.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { 
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }) }
  });
}

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

/** Verify the caller is an admin (role read from public.users via the
 *  service client, NOT from user_metadata which users can edit themselves).
 *  The caller must ALSO be approved — pending/rejected admins (should that
 *  state ever exist) get 403 like everyone else. */
export async function requireFirmAdmin(): Promise<
  | { error: string; status: 401 | 403 | 503 }
  | { svc: ServiceClient; firmId: string; adminId: string }
> {
  const anon = await createServerSupabase();
  if (!anon) return { error: "Supabase not configured", status: 503 };
  const { data: { user: caller } } = await anon.auth.getUser();
  if (!caller) return { error: "Not signed in", status: 401 };
  const svc = createServiceClient();
  if (!svc) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY", status: 503 };
  const { data: row } = await svc
    .from("users")
    .select("role,firm_id,approval_status")
    .eq("id", caller.id)
    .single();
  const r = row as { role?: string; firm_id?: string; approval_status?: string } | null;
  if (!r || r.role !== "admin" || !r.firm_id) return { error: "Admin only", status: 403 };
  if (r.approval_status !== "approved") return { error: "Account pending approval", status: 403 };
  return { svc, firmId: r.firm_id, adminId: caller.id };
}

/**
 * Approval gate for ordinary data routes (tasks, filings, documents, ...).
 * Uses the caller's own session (RLS still applies) and rejects
 * pending/rejected users with 403. Admins are never subject to approval.
 */
export async function requireApprovedUser(): Promise<
  | { error: string; status: 401 | 403 | 503 }
  | { sb: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>; userId: string }
> {
  const sb = await createServerSupabase();
  if (!sb) return { error: "Supabase not configured", status: 503 };
  const { data: { user: caller } } = await sb.auth.getUser();
  if (!caller) return { error: "Not signed in", status: 401 };
  const { data: row } = await sb
    .from("users")
    .select("role,approval_status")
    .eq("id", caller.id)
    .single();
  const r = row as { role?: string; approval_status?: string } | null;
  const role = r?.role ?? (caller.user_metadata?.role as string | undefined) ?? null;
  // Admins bypass approval entirely.
  if (role === "admin") return { sb, userId: caller.id };
  // No profile row yet (e.g. self-signup before profile creation) → treat as pending.
  if (!r || r.approval_status !== "approved") {
    return { error: "Account pending approval", status: 403 };
  }
  return { sb, userId: caller.id };
}

/** Lightweight in-memory per-key rate limiter for sensitive endpoints.
 *  Not a distributed limiter — sufficient as abuse friction per instance. */
const _hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): number {
  const now = Date.now();
  const list = (_hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  _hits.set(key, list);
  if (list.length > max) {
    const oldest = list[0];
    return Math.ceil((windowMs - (now - oldest)) / 1000);
  }
  return 0;
}

/**
 * Layout-level gate: returns the caller's DB role + approval status.
 *
 * Uses the SERVICE ROLE client for the DB read so RLS cannot block it.
 * The anon client reads users via RLS → is_approved() → users again,
 * which can return null for pending users and misfire for approved ones.
 */
export async function getLayoutGate(): Promise<
  | { user: null }
  | { user: { id: string; email?: string; name: string; role: string | null; approvalStatus: string } }
> {
  const anon = await createServerSupabase();
  if (!anon) return { user: null };
  const { data: { user: caller } } = await anon.auth.getUser();
  if (!caller) return { user: null };

  const meta = caller.user_metadata as { role?: string; name?: string } | undefined;

  // Use service-role for the DB query — bypasses RLS and fetch cache entirely.
  const svc = createServiceClient();
  const { data: row } = await (svc ?? anon)
    .from("users")
    .select("role,approval_status,name")
    .eq("id", caller.id)
    .single();

  const r = row as { role?: string; approval_status?: string; name?: string } | null;
  return {
    user: {
      id: caller.id,
      email: caller.email,
      name: r?.name ?? meta?.name ?? caller.email ?? "User",
      role: r?.role ?? meta?.role ?? null,
      // No profile row yet → treat as pending (safest default).
      approvalStatus: r?.approval_status ?? "pending",
    },
  };
}
