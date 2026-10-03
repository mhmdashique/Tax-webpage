import { NextResponse } from "next/server";
import { requireFirmAdmin } from "@/lib/supabase/service";

/** GET: users in the caller's firm (role + approval state). */
export async function GET() {
  const gate = await requireFirmAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { svc, firmId } = gate;
  const { data: profiles, error } = await svc
    .from("users")
    .select("id,email,name,role,requested_role,approval_status,rejected_reason,created_at")
    .eq("firm_id", firmId)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: profiles ?? [] });
}

/**
 * POST: create an employee/client account with instant login.
 * Body: { email, password (min 6), name, role: "employee"|"client" }
 *
 * No email verification anywhere: the account is pre-confirmed and approved
 * immediately (the creating admin IS the approver).
 */
export async function POST(req: Request) {
  const gate = await requireFirmAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { svc, firmId } = gate;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : email.split("@")[0];
  const role = body.role === "employee" ? "employee" : body.role === "client" ? "client" : null;

  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "Valid email required" }, { status: 422 });
  if (!role)
    return NextResponse.json({ error: 'Role must be "employee" or "client"' }, { status: 422 });
  if (password.length < 6)
    return NextResponse.json({ error: "Set a temporary password (min 6 chars)" }, { status: 422 });

  // Pre-confirmed, instant login — no email is sent.
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (createErr || !created?.user) {
    const m = (createErr?.message ?? "").toLowerCase();
    if (m.includes("already"))
      return NextResponse.json({ error: "This email is already registered" }, { status: 409 });
    return NextResponse.json({ error: createErr?.message ?? "Could not create user" }, { status: 400 });
  }
  const userId = created.user.id;

  const { error: profErr } = await svc.from("users").insert([
    // Admin-created logins skip the approval queue: the admin IS the approver.
    // (Self-signups via /api/auth/signup insert as pending instead.)
    { id: userId, firm_id: firmId, email, name, role, requested_role: role, approval_status: "approved" },
  ]);
  if (profErr) {
    await svc.auth.admin.deleteUser(userId).then(() => {}, () => {});
    return NextResponse.json(
      { error: `Auth user created but profile failed: ${profErr.message}` },
      { status: 500 }
    );
  }

  let clientWarning: string | null = null;
  if (role === "client") {
    const { error: clientErr } = await svc.from("clients").insert([
      { firm_id: firmId, linked_user_id: userId, name, email, business_name: name, status: "active" },
    ]);
    if (clientErr)
      clientWarning = `Client profile created but company link failed: ${clientErr.message}`;
  }

  return NextResponse.json(
    {
      data: { id: userId, email, name, role, approval_status: "approved" },
      warning: clientWarning,
    },
    { status: 201 }
  );
}
