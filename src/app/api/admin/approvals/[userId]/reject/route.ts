import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { rateLimit, requireFirmAdmin } from "@/lib/supabase/service";
import { rejectBodySchema } from "@/lib/validators";

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const retryAfter = rateLimit(`reject:${req.headers.get("x-forwarded-for") ?? "local"}`, 30, 60_000);
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
  const parsed = rejectBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { data: target } = await svc
    .from("users")
    .select("id, email, name, role, approval_status")
    .eq("id", userId)
    .eq("firm_id", firmId)
    .single();
  const t = target as {
    id: string; email: string; name: string; role: string; approval_status: string;
  } | null;

  if (!t) return NextResponse.json({ error: "User not found in your firm" }, { status: 404 });
  if (t.role === "admin") {
    return NextResponse.json({ error: "Admin accounts are not subject to approval" }, { status: 422 });
  }
  // Idempotent: rejecting an already-rejected user just updates the reason.
  if (t.approval_status === "rejected" && !parsed.data.reason) {
    return NextResponse.json({ success: true, message: "Already rejected" });
  }

  const now = new Date().toISOString();

  const { error: updateErr } = await svc
    .from("users")
    .update({
      approval_status: "rejected",
      rejected_reason: parsed.data.reason ?? null,
      reviewed_at: now,
    })
    .eq("id", userId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Activity log (best effort) — include the admin's proper name.
  const { data: adminRow } = await svc.from("users").select("name").eq("id", adminId).maybeSingle();
  const adminName = (adminRow as { name?: string } | null)?.name?.trim() || "Admin";
  await svc.from("activity_log").insert([{
    firm_id: firmId,
    actor_id: adminId,
    actor_name: adminName,
    action: `rejected ${t.email} by ${adminName}`,
    entity_type: "user",
    entity_id: userId,
  }]).then(() => {}, () => {});

  // Notify the user via the existing mailer (non-blocking; never fails rejection).
  try {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM ?? "TaxDesk <onboarding@resend.dev>";
    if (key && key !== "re_your_api_key_here") {
      const resend = new Resend(key);
      const reason = parsed.data.reason;
      await resend.emails.send({
        from, to: t.email,
        subject: "Update on your TaxDesk account request",
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px">Account request update</h2>
          <p style="color:#555">Hi ${t.name},</p>
          <p style="color:#555">Unfortunately your TaxDesk account request was not approved at this time.</p>
          ${reason ? `<p style="color:#555"><strong>Reason:</strong> ${reason}</p>` : ""}
          <p style="color:#555">Please contact your administrator if you believe this is an error.</p>
        </div>`,
        text: `Hi ${t.name},\n\nYour TaxDesk account request was not approved.${reason ? `\n\nReason: ${reason}` : ""}`,
      });
    }
  } catch { /* non-blocking */ }

  return NextResponse.json({ success: true });
}
