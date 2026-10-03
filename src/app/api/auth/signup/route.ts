import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/auth/signup — PUBLIC.
 * Body: { name, email, password, role: "client"|"employee", redirectTo? }
 *
 * Creates an unconfirmed user via the service role, generates a confirmation
 * link, and delivers it via Resend. Never uses Supabase's built-in mailer,
 * so there is no 2/hour quota to hit.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : email.split("@")[0];
  const role = body.role === "employee" ? "employee" : "client";
  const redirectTo =
    typeof body.redirectTo === "string" && body.redirectTo.startsWith("http")
      ? body.redirectTo
      : undefined;

  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "Valid email required" }, { status: 422 });
  if (password.length < 6)
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 422 });

  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  // Create unconfirmed — no email sent by Supabase.
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { name, role },
  });

  if (createErr || !created?.user) {
    const m = (createErr?.message ?? "").toLowerCase();
    if (m.includes("already"))
      return NextResponse.json({ error: "This email is already registered. Log in instead." }, { status: 409 });
    return NextResponse.json({ error: createErr?.message ?? "Could not create account" }, { status: 400 });
  }

  const userId = created.user.id;

  // Generate confirmation link (Supabase does NOT send an email for generateLink).
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type: "invite",
    email,
    ...(redirectTo ? { options: { redirectTo } } : {}),
  });
  const confirmLink = (
    linkData as unknown as { properties?: { action_link?: string } } | null
  )?.properties?.action_link;

  if (linkErr || !confirmLink) {
    // Account created but link failed — delete and report.
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json(
      { error: linkErr?.message ?? "Could not generate confirmation link" },
      { status: 500 }
    );
  }

  // Send via Resend.
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "TaxDesk <onboarding@resend.dev>";

  if (!resendKey || resendKey === "re_your_api_key_here") {
    // Resend not configured — delete user and tell them to ask admin.
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json(
      { error: "Email service is not configured. Ask your admin to create your account from the Team page." },
      { status: 503 }
    );
  }

  const resend = new Resend(resendKey);
  const { error: sendErr } = await resend.emails.send({
    from,
    to: email,
    subject: "Confirm your TaxDesk account",
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 8px">Confirm your TaxDesk account</h2>
      <p style="color:#555;margin:0 0 24px">Hi ${name},</p>
      <p style="color:#555;margin:0 0 24px">Click the button below to activate your account. This link expires in <strong>24 hours</strong>.</p>
      <a href="${confirmLink}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">Activate my account</a>
      <p style="color:#999;font-size:12px;margin:24px 0 0">Or copy this link: <a href="${confirmLink}" style="color:#2563EB">${confirmLink}</a></p>
    </div>`,
    text: `Hi ${name},\n\nActivate your TaxDesk account (expires in 24 hours):\n\n${confirmLink}`,
  });

  if (sendErr) {
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json(
      { error: `Could not send confirmation email: ${sendErr.message}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ needsConfirmation: true });
}
