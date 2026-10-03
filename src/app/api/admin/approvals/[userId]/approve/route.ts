import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { rateLimit, requireFirmAdmin } from "@/lib/supabase/service";
import { approveBodySchema } from "@/lib/validators";

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  // Abuse friction: 30 approvals/min per admin IP.
  const retryAfter = rateLimit(`approve:${req.headers.get("x-forwarded-for") ?? "local"}`, 30, 60_000);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${retryAfter}s.` },
      { status: 429 }
    );
  }

  const gate = await requireFirmAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { svc, firmId, adminId } = gate;
  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 422 });
  }

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = approveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  // Verify user belongs to this firm and is not an admin (role elevation to
  // admin via approval is impossible — admins are created by seed/admin only).
  const { data: target } = await svc
    .from("users")
    .select("id, email, name, role, requested_role, approval_status")
    .eq("id", userId)
    .eq("firm_id", firmId)
    .single();
  const t = target as {
    id: string; email: string; name: string; role: string;
    requested_role: string | null; approval_status: string;
  } | null;

  if (!t) return NextResponse.json({ error: "User not found in your firm" }, { status: 404 });
  if (t.role === "admin") {
    return NextResponse.json({ error: "Admin accounts are not subject to approval" }, { status: 422 });
  }
  // Approval unlocks the login completely: confirm the email too, so accounts
  // created before verification was removed can actually sign in afterwards.
  // Best effort — a failure is reported but never blocks the approval itself.
  let emailConfirmWarning: string | null = null;
  try {
    const { error: confirmErr } = await svc.auth.admin.updateUserById(userId, { email_confirm: true });
    if (confirmErr) emailConfirmWarning = confirmErr.message;
  } catch (e: unknown) {
    emailConfirmWarning = e instanceof Error ? e.message : "Could not confirm email";
  }
  // Idempotent: approving an already-approved user is a no-op success
  // (email is still confirmed above, which repairs legacy accounts).
  if (t.approval_status === "approved") {
    return NextResponse.json({ success: true, message: "Already approved", emailConfirmWarning });
  }
  // Re-approval from rejected is allowed (Reject is reversible).
  const finalRole = t.requested_role === "employee" ? "employee" : "client";

  // If assigning an accountant, it must be an approved employee of this firm.
  if (parsed.data.assigned_employee_id) {
    const { data: emp } = await svc
      .from("users")
      .select("id")
      .eq("id", parsed.data.assigned_employee_id)
      .eq("firm_id", firmId)
      .eq("role", "employee")
      .eq("approval_status", "approved")
      .single();
    if (!emp) {
      return NextResponse.json(
        { error: "Assigned accountant must be an approved employee of your firm" },
        { status: 422 }
      );
    }
  }

  const now = new Date().toISOString();

  const { data: updated, error: updateErr } = await svc
    .from("users")
    .update({
      approval_status: "approved",
      requested_role: finalRole,
      role: finalRole,
      approved_by: adminId,
      approved_at: now,
      reviewed_at: now,
      rejected_reason: null,
    })
    .eq("id", userId)
    .select("id, approval_status, role, approved_at")
    .single();

  // Fail loudly: never report success without a confirmed, persisted update.
  // (Service role bypasses RLS, so 0 rows / wrong values here means a trigger
  // or filter problem, not a permission problem.)
  const saved = updated as { id: string; approval_status: string; role: string } | null;
  if (updateErr || !saved || saved.approval_status !== "approved") {
    return NextResponse.json(
      { error: updateErr?.message ?? "Approval did not persist — no row was updated" },
      { status: 500 }
    );
  }

  // If client role and an accountant was chosen, link in the same step.
  if (finalRole === "client" && parsed.data.assigned_employee_id) {
    await svc
      .from("clients")
      .update({ assigned_employee_id: parsed.data.assigned_employee_id })
      .eq("linked_user_id", userId)
      .then(() => {}, () => {});
  }

  // Activity log (best effort).
  await svc.from("activity_log").insert([{
    firm_id: firmId,
    actor_id: adminId,
    action: "approved_user",
    entity_type: "user",
    entity_id: userId,
  }]).then(() => {}, () => {});

  // Notify the user via the existing mailer (non-blocking; never fails approval).
  try {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM ?? "TaxDesk <onboarding@resend.dev>";
    if (key && key !== "re_your_api_key_here") {
      const resend = new Resend(key);
      await resend.emails.send({
        from, to: t.email,
        subject: "Your TaxDesk account has been approved",
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px">You're approved! 🎉</h2>
          <p style="color:#555">Hi ${t.name},</p>
          <p style="color:#555">Your TaxDesk account has been approved. You can now log in and access your ${finalRole} dashboard.</p>
          <a href="${req.headers.get("origin") ?? ""}/login" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin-top:16px">Log in now</a>
        </div>`,
        text: `Hi ${t.name},\n\nYour TaxDesk account has been approved. Log in at /login.`,
      });
    }
  } catch { /* non-blocking */ }

  return NextResponse.json({ success: true, emailConfirmWarning });
}
