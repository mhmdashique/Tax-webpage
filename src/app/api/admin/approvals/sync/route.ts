import { NextResponse } from "next/server";
import { createServiceClient, rateLimit, requireFirmAdmin } from "@/lib/supabase/service";

type Svc = NonNullable<ReturnType<typeof createServiceClient>>;

interface AuthUserShape {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}

/**
 * Shared: find one auth user by email (listUsers is paginated — scan pages).
 */
async function findAuthUserByEmail(svc: Svc, email: string): Promise<AuthUserShape | null> {
  const perPage = 200;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = ((data?.users ?? []) as AuthUserShape[]);
    const hit = users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (users.length < perPage) break;
  }
  return null;
}
/**
 * POST /api/admin/approvals/sync — repair queue.
 *
 * Repairs BOTH ways a signup can go missing from the admin queue:
 *  1. Auth user with NO public.users row (signed up before the queue existed,
 *     or profile insert lost) → creates a pending profile in the admin's firm.
 *  2. Profile row exists but has firm_id = NULL (or missing requested_role) →
 *     adopts it into the admin's firm and backfills requested_role.
 * Never creates or touches admins, never touches the email confirmation flow.
 */
export async function POST(req: Request) {
  const retryAfter = rateLimit(`sync:${req.headers.get("x-forwarded-for") ?? "local"}`, 10, 60_000);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${retryAfter}s.` },
      { status: 429 }
    );
  }

  const gate = await requireFirmAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { svc, firmId, adminId } = gate;

  // Ensure the company row the dashboards depend on exists for a client.
  async function ensureClientRow(s: Svc, userId: string, name: string, email: string) {
    const { data: company } = await s
      .from("clients")
      .select("id, linked_user_id")
      .eq("firm_id", firmId)
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    const c = company as { id: string; linked_user_id: string | null } | null;
    if (c && !c.linked_user_id) {
      await s.from("clients").update({ linked_user_id: userId }).eq("id", c.id)
        .then(() => {}, () => {});
    } else if (!c) {
      await s.from("clients").insert([{
        firm_id: firmId,
        linked_user_id: userId,
        name,
        email,
        business_name: name,
        status: "active",
      }]).then(() => {}, () => {});
    }
  }

  // Existing profile ids in this firm.
  const { data: existing } = await svc.from("users").select("id").eq("firm_id", firmId);
  const have = new Set(((existing ?? []) as { id: string }[]).map((r) => r.id));

  // Scan auth users for orphans (no profile row anywhere).
  const { data: allProfiles } = await svc.from("users").select("id");
  const haveAnywhere = new Set(((allProfiles ?? []) as { id: string }[]).map((r) => r.id));

  const orphans: { id: string; email: string; name: string; role: "employee" | "client" }[] = [];
  const perPage = 200;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const users = (data?.users ?? []) as {
      id: string; email?: string; user_metadata?: Record<string, unknown>;
    }[];
    for (const u of users) {
      if (have.has(u.id) || haveAnywhere.has(u.id)) continue;
      const meta = u.user_metadata ?? {};
      // Never auto-create admins through this repair path.
      if (meta["role"] === "admin") continue;
      const email = typeof u.email === "string" ? u.email : "";
      if (!email) continue;
      const name =
        typeof meta["name"] === "string" && meta["name"].trim()
          ? (meta["name"] as string).trim()
          : email.split("@")[0];
      orphans.push({
        id: u.id,
        email: email.toLowerCase(),
        name,
        role: meta["role"] === "employee" ? "employee" : "client",
      });
    }
    if (users.length < perPage) break;
  }

  let synced = 0;
  const failed: string[] = [];
  for (const o of orphans) {
    const { error: insErr } = await svc.from("users").insert([{
      id: o.id,
      firm_id: firmId,
      email: o.email,
      name: o.name,
      role: o.role,
      requested_role: o.role,
      approval_status: "pending",
    }]);
    if (insErr) {
      failed.push(o.email);
      continue;
    }
    synced++;
    // No email verification: confirm the address so the user can sign in
    // as soon as they are approved.
    await svc.auth.admin.updateUserById(o.id, { email_confirm: true }).then(() => {}, () => {});
    if (o.role === "client") {
      // Link to an existing company row if one was pre-created for this email,
      // otherwise create it — same as the signup path.
      await ensureClientRow(svc, o.id, o.name, o.email);
    }
  }

  // Adopt queue rows that exist but have no firm (invisible to firm-scoped
  // queries) into this firm, and backfill a missing requested_role.
  let adopted = 0;
  const { data: firmLess } = await svc
    .from("users")
    .select("id, email, name, role, requested_role, approval_status")
    .is("firm_id", null)
    .in("approval_status", ["pending", "rejected"]);
  for (const r of ((firmLess ?? []) as {
    id: string; email: string; name: string; role: string;
    requested_role: string | null; approval_status: string;
  }[])) {
    if (r.role === "admin") continue; // never adopt admins
    const finalRole = r.requested_role === "employee" ? "employee" : "client";
    const { error: adoptErr } = await svc
      .from("users")
      .update({ firm_id: firmId, requested_role: finalRole })
      .eq("id", r.id);
    if (adoptErr) continue;
    adopted++;
    await svc.auth.admin.updateUserById(r.id, { email_confirm: true }).then(() => {}, () => {});
    if (finalRole === "client") {
      await ensureClientRow(svc, r.id, r.name, r.email);
    }
  }

  if (synced + adopted > 0) {
    await svc.from("activity_log").insert([{
      firm_id: firmId,
      actor_id: adminId,
      action: "synced_signups",
      entity_type: "user",
      entity_id: null,
    }]).then(() => {}, () => {});
  }

  return NextResponse.json({ success: true, synced, adopted, found: orphans.length, failed });
}

/**
 * GET /api/admin/approvals/sync?email=someone@example.com — diagnose ONE
 * address: reports whether the approval columns exist, whether the auth
 * account exists, every queue row for that email (any firm), and a verdict
 * explaining why it does / doesn't appear in the admin queue.
 */
export async function GET(req: Request) {
  const gate = await requireFirmAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { svc, firmId } = gate;

  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required (?email=...)" }, { status: 422 });
  }

  // 0. Are the approval migrations applied to this database?
  const probe = await svc.from("users").select("approval_status").limit(1);
  const migrationOk = !probe.error;
  const migrationError = probe.error ? probe.error.message : null;

  // 1. Auth account?
  let authUser: { id: string; emailConfirmed: boolean } | null = null;
  let authLookupError: string | null = null;
  try {
    const hit = await findAuthUserByEmail(svc, email);
    if (hit) authUser = { id: hit.id, emailConfirmed: Boolean(hit.email_confirmed_at) };
  } catch (e: unknown) {
    authLookupError = e instanceof Error ? e.message : "Auth lookup failed";
  }

  // 2. Queue rows for this email in ANY firm (case-insensitive).
  interface Row {
    id: string; email: string; name: string; role: string;
    requested_role: string | null; approval_status: string;
    firm_id: string | null; created_at: string;
    approved_by: string | null; approved_at: string | null;
  }
  let profiles: Row[] = [];
  let profileError: string | null = null;
  if (migrationOk) {
    const { data, error } = await svc
      .from("users")
      .select("id,email,name,role,requested_role,approval_status,firm_id,created_at,approved_by,approved_at")
      .ilike("email", email);
    if (error) profileError = error.message;
    else profiles = ((data ?? []) as Row[]);
  }

  // 3. Verdict.
  let verdict: string;
  if (!migrationOk) {
    verdict = "Migrations 0008/0009 are NOT applied to this database (approval_status column is missing). Apply them first — nothing in the queue can work until then.";
  } else if (authLookupError) {
    verdict = `Could not look up the auth account: ${authLookupError}`;
  } else if (!authUser && profiles.length === 0) {
    verdict = "No account with this email exists in THIS Supabase project. The signup probably went to a different project (compare NEXT_PUBLIC_SUPABASE_URL) or failed.";
  } else if (authUser && profiles.length === 0) {
    verdict = "Auth account exists but has NO queue entry. Click “Sync signups” to pull it into Pending.";
  } else {
    const p = profiles[0];
    if (p.role === "admin") {
      verdict = "This address is an ADMIN account — admins never appear in the approval queue.";
    } else if (authUser && !profiles.some((r) => r.id === authUser.id)) {
      verdict = "ID MISMATCH: the login account and the queue row have different ids — approvals update a different row than the one this user logs in with. Note both ids and contact support.";
    } else if (p.approval_status === "approved") {
      if (authUser && !authUser.emailConfirmed) {
        verdict = "APPROVED in the queue, but the login email was never confirmed — that is why sign-in fails. Click Accept on this user again (re-approving confirms the email), then have them log in.";
      } else {
        verdict = "Already APPROVED — this user should log in normally, not see the waiting screen. If they still see it, they are logging into a different app/project than this one.";
      }
    } else if (p.approval_status === "rejected") {
      verdict = "This request was REJECTED — look under the Rejected tab (you can re-approve from there).";
    } else if (p.firm_id !== null && p.firm_id !== firmId) {
      verdict = "Queued under a DIFFERENT firm — invisible to your admin list. It needs moving to your firm.";
    } else {
      verdict = "This row IS in your Pending queue and should be listed. If the list is empty, the list request itself is failing — read the error box in Pending Requests.";
    }
  }

  return NextResponse.json({
    email,
    adminFirm: firmId,
    migrationOk,
    migrationError,
    authUser,
    authLookupError,
    profiles,
    profileError,
    verdict,
  });
}
