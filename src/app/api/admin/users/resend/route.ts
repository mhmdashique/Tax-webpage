import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireFirmAdmin } from "@/lib/supabase/service";

/**
 * GET /api/admin/users/resend — check whether Resend is configured & reachable.
 * Returns { connected: boolean, from: string | null, error?: string }
 */
export async function GET() {
  const gate = await requireFirmAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? null;

  if (!key || key === "re_your_api_key_here") {
    return NextResponse.json({ connected: false, from, error: "RESEND_API_KEY is not set" });
  }

  try {
    const resend = new Resend(key);
    // Listing domains is a lightweight read-only call that confirms the key is valid.
    const { error } = await resend.domains.list();
    if (error) return NextResponse.json({ connected: false, from, error: error.message });
    return NextResponse.json({ connected: true, from });
  } catch (e: unknown) {
    return NextResponse.json({ connected: false, from, error: e instanceof Error ? e.message : "Unknown error" });
  }
}

/**
 * POST /api/admin/users/resend — re-notify one firm user by email via Resend.
 * Body: { email, redirectTo?: string }
 *
 * - Unconfirmed user -> generates an invite link + emails it via Resend.
 * - Confirmed user   -> generates a magic-link + emails it via Resend.
 * Always returns the `loginLink` the admin can also forward manually.
 */
export async function POST(req: Request) {
  const gate = await requireFirmAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { svc, firmId } = gate;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const redirectTo =
    typeof body.redirectTo === "string" && body.redirectTo.startsWith("http")
      ? body.redirectTo
      : undefined;
  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "Valid email required" }, { status: 422 });

  // Must belong to the caller's firm.
  const { data: profile } = await svc
    .from("users")
    .select("id,name")
    .eq("firm_id", firmId)
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "No such user in your firm" }, { status: 404 });
  const userName = (profile as { id: string; name?: string }).name ?? email.split("@")[0];

  const { data: authList } = await svc.auth.admin.listUsers({ perPage: 200 });
  const authUser = (
    (authList?.users ?? []) as { id: string; email?: string; email_confirmed_at?: string | null }[]
  ).find((u) => u.email?.toLowerCase() === email);
  if (!authUser)
    return NextResponse.json({ error: "Auth record not found for this email" }, { status: 404 });

  // Generate the appropriate link (no email sent by Supabase — we send via Resend).
  const isConfirmed = Boolean(authUser.email_confirmed_at);
  const linkType = isConfirmed ? "magiclink" : "invite";

  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type: linkType,
    email,
    ...(redirectTo ? { options: { redirectTo } } : {}),
  });
  const props = (linkData as unknown as { properties?: { action_link?: string } } | null)
    ?.properties;
  const loginLink = props?.action_link ?? null;

  if (linkErr || !loginLink) {
    return NextResponse.json(
      { error: linkErr?.message ?? "Could not generate login link" },
      { status: 500 }
    );
  }

  // Send via Resend.
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "TaxDesk <onboarding@resend.dev>";

  if (!resendKey || resendKey === "re_your_api_key_here") {
    // Resend not configured — return the link for manual forwarding.
    return NextResponse.json({
      emailed: false,
      emailNote: "RESEND_API_KEY is not configured. Copy the login link below and forward it manually.",
      loginLink,
    });
  }

  const resend = new Resend(resendKey);
  const subject = isConfirmed ? "Your TaxDesk login link" : "You've been invited to TaxDesk";
  const actionLabel = isConfirmed ? "Log in to TaxDesk" : "Accept invitation";
  const bodyText = isConfirmed
    ? `Hi ${userName},\n\nClick the link below to log in to TaxDesk (expires in 1 hour):\n\n${loginLink}\n\nIf you didn't request this, you can ignore this email.`
    : `Hi ${userName},\n\nYou've been invited to TaxDesk. Click the link below to set your password and activate your account (expires in 24 hours):\n\n${loginLink}\n\nIf you didn't expect this invitation, you can ignore this email.`;

  const { error: sendErr } = await resend.emails.send({
    from,
    to: email,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px">${subject}</h2>
        <p style="color:#555;margin:0 0 24px">Hi ${userName},</p>
        <p style="color:#555;margin:0 0 24px">
          ${isConfirmed
            ? "Click the button below to log in to TaxDesk. This link expires in <strong>1 hour</strong>."
            : "You've been invited to TaxDesk. Click the button below to set your password and activate your account. This link expires in <strong>24 hours</strong>."}
        </p>
        <a href="${loginLink}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
          ${actionLabel}
        </a>
        <p style="color:#999;font-size:12px;margin:24px 0 0">
          Or copy this link: <a href="${loginLink}" style="color:#2563EB">${loginLink}</a>
        </p>
      </div>`,
    text: bodyText,
  });

  if (sendErr) {
    return NextResponse.json({
      emailed: false,
      emailNote: `Resend error: ${sendErr.message}. Share the login link below manually.`,
      loginLink,
    });
  }

  return NextResponse.json({ emailed: true, emailNote: null, loginLink });
}
