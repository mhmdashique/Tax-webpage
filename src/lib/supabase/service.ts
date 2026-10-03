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
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;

/** Verify the caller is an admin (role read from public.users via the
 *  service client, NOT from user_metadata which users can edit themselves). */
export async function requireFirmAdmin(): Promise<
  | { error: string; status: 401 | 403 | 503 }
  | { svc: ServiceClient; firmId: string }
> {
  const anon = await createServerSupabase();
  if (!anon) return { error: "Supabase not configured", status: 503 };
  const { data: { user: caller } } = await anon.auth.getUser();
  if (!caller) return { error: "Not signed in", status: 401 };
  const svc = createServiceClient();
  if (!svc) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY", status: 503 };
  const { data: row } = await svc.from("users").select("role,firm_id").eq("id", caller.id).single();
  const r = row as { role?: string; firm_id?: string } | null;
  if (!r || r.role !== "admin" || !r.firm_id) return { error: "Admin only", status: 403 };
  return { svc, firmId: r.firm_id };
}
