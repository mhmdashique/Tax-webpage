import { NextResponse } from "next/server";
import { createServiceClient, rateLimit } from "@/lib/supabase/service";

/** Throwaway-mail domains rejected at sign-up (approval is the only gate). */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "mailinator.net", "tempmail.com", "temp-mail.org",
  "guerrillamail.com", "guerrillamail.net", "10minutemail.com", "10minutemail.net",
  "throwawaymail.com", "fakeinbox.com", "maildrop.cc", "yopmail.com", "trashmail.com",
]);

/**
 * POST /api/auth/signup — PUBLIC.
 * Body: { name, email, password, role: "client"|"employee" }
 *
 * No email verification: accounts are created pre-confirmed and go straight
 * into the admin approval queue (approval_status = 'pending').
 */
export async function POST(req: Request) {
  // Abuse friction on the public endpoint.
  const retryAfter = rateLimit(`signup:${req.headers.get("x-forwarded-for") ?? "local"}`, 10, 60_000);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${retryAfter}s.` },
      { status: 429 }
    );
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : email.split("@")[0];
  const role = body.role === "employee" ? "employee" : "client";

  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "Valid email required" }, { status: 422 });
  if (password.length < 6)
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 422 });
  // Approval is the only gate now that emails aren't verified: refuse
  // throwaway domains so fake sign-ups can't flood the admin queue.
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return NextResponse.json(
      { error: "Please use a permanent email address — temporary mail is not accepted." },
      { status: 422 }
    );
  }

  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  // Create pre-confirmed — no verification email is sent anywhere.
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });

  if (createErr || !created?.user) {
    const m = (createErr?.message ?? "").toLowerCase();
    if (m.includes("already"))
      return NextResponse.json({ error: "This email is already registered. Log in instead." }, { status: 409 });
    return NextResponse.json({ error: createErr?.message ?? "Could not create account" }, { status: 400 });
  }

  const userId = created.user.id;

  // Attach the new auth user to the firm's pending-approval queue. Role
  // elevation is impossible here — only "client" | "employee" reach this route.
  // Firm choice is deterministic: the admin's firm first (single-firm model),
  // so the request always lands in the queue the admin actually watches.
  try {
    const { data: adminRows } = await svc
      .from("users")
      .select("firm_id")
      .eq("role", "admin")
      .limit(1);
    let firmId = ((adminRows as { firm_id: string }[] | null)?.[0]?.firm_id) ?? null;
    if (!firmId) {
      const { data: firms } = await svc.from("firms").select("id").limit(1);
      firmId = ((firms as { id: string }[] | null)?.[0]?.id) ?? null;
    }
    if (!firmId) {
      const { data: firm } = await svc
        .from("firms")
        .insert([{ name: "Apex Tax Advisors", plan_tier: "pro" }])
        .select("id")
        .single();
      firmId = (firm as { id: string } | null)?.id ?? null;
    }
    if (!firmId) throw new Error("No firm");
    const { error: profErr } = await svc.from("users").insert([{
      id: userId,
      firm_id: firmId,
      email,
      name,
      role,
      requested_role: role,
      approval_status: "pending",
    }]);
    if (profErr) throw profErr;
    if (role === "client") {
      await svc.from("clients").insert([{
        firm_id: firmId,
        linked_user_id: userId,
        name,
        email,
        business_name: name,
        status: "active",
      }]).then(() => {}, () => {});
    }
  } catch {
    // Profile queueing failed — roll back the auth user so signup is atomic.
    // (public.users cascades via FK; remove any orphan client row too.)
    await svc.from("clients").delete().eq("linked_user_id", userId).then(() => {}, () => {});
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: "Could not create account" }, { status: 500 });
  }

  return NextResponse.json({ pending: true });
}
