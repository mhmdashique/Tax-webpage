import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/auth/me
 *
 * Returns the caller's role + approval_status read DIRECTLY from the database
 * via the service-role client (bypasses RLS and any cache). Used by the
 * pending-approval page to poll for status changes without relying on
 * browser-side Supabase which can serve stale JWT / cached responses.
 *
 * No auth secret is leaked — we identify the caller from their own session
 * cookie (createServerSupabase) and only return their own row.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // 1. Identify the caller from their session cookie (anon client, server-side).
  const anon = await createServerSupabase();
  if (!anon) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const { data: { user }, error: userErr } = await anon.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // 2. Read the DB row via service role — bypasses RLS and any fetch cache.
  const svc = createServiceClient();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }
  const { data: row, error: rowErr } = await svc
    .from("users")
    .select("role, approval_status")
    .eq("id", user.id)
    .single();

  if (rowErr || !row) {
    return NextResponse.json(
      { error: rowErr?.message ?? "Profile not found" },
      { status: rowErr ? 500 : 404 }
    );
  }

  const r = row as { role?: string; approval_status?: string };
  return NextResponse.json({
    id: user.id,
    email: user.email,
    role: r.role ?? null,
    approval_status: r.approval_status ?? "pending",
  });
}
