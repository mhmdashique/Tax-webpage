import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient, requireFirmAdmin } from "@/lib/supabase/service";

/** Send an invite or magic-link email via Resend. Returns an error string or null. */
async function sendViaResend(
  email: string,
  name: string,
  loginLink: string,
  isInvite: boolean
): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "TaxDesk <noreply@yourdomain.com>";
  if (!key || key === "re_your_api_key_here")
    return "RESEND_API_KEY is not configured — no email sent.";
  const resend = new Resend(key);
  const subject = isInvite ? "You've been invited to TaxDesk" : "Your TaxDesk login link";
  const actionLabel = isInvite ? "Accept invitation" : "Log in to TaxDesk";
  const bodyLine = isInvite
    ? "You've been invited to TaxDesk. Click the button below to set your password and activate your account. This link expires in <strong>24 hours</strong>."
    : "Click the button below to log in to TaxDesk. This link expires in <strong>1 hour</strong>.";
  const { error } = await resend.emails.send({
    from,
    to: email,
    subject,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 8px">${subject}</h2>
      <p style="color:#555;margin:0 0 24px">Hi ${name},</p>
      <p style="color:#555;margin:0 0 24px">${bodyLine}</p>
      <a href="${loginLink}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">${actionLabel}</a>
      <p style="color:#999;font-size:12px;margin:24px 0 0">Or copy this link: <a href="${loginLink}" style="color:#2563EB">${loginLink}</a></p>
    </div>`,
    text: `Hi ${name},\n\n${isInvite ? "You've been invited to TaxDesk. Activate your account:" : "Log in to TaxDesk:"}\n\n${loginLink}`,
  });
  return error ? `Resend error: ${error.message}` : null;
}

/** GET: users in the caller's firm (email, confirmed?, role). */
export async function GET() {
  const gate = await requireFirmAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { svc, firmId } = gate;
  const { data: profiles } = await svc.from("users").select("id,email,name,role").eq("firm_id", firmId).limit(200);
  const profs = (profiles ?? []) as { id: string; email: string; name: string; role: string }[];
  const { data: authList } = await svc.auth.admin.listUsers({ perPage: 200 });
  const confirmedById = new Map(
    ((authList?.users ?? []) as { id: string; email_confirmed_at?: string | null }[]).map((u) => [
      u.id,
      Boolean(u.email_confirmed_at),
    ])
  );
  return NextResponse.json({
    data: profs.map((p) => ({ ...p, email_confirmed: confirmedById.get(p.id) ?? null })),
  });
}

/**
 * POST: create an employee/client account.
 * Body: { email, password (min 6), name, role: "employee"|"client",
 *         sendEmail?: boolean, redirectTo?: string }
 *
 * - sendEmail=false: pre-confirmed, instant login, no email sent.
 * - sendEmail=true:  creates unconfirmed user, generates invite link,
 *   delivers it via Resend (no Supabase mail quota used).
 * Always returns a `loginLink` the admin can forward manually.
 */
export async function POST(req: Request) {
  const gate = await requireFirmAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { svc, firmId } = gate;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : email.split("@")[0];
  const role = body.role === "employee" ? "employee" : body.role === "client" ? "client" : null;
  const sendEmail = body.sendEmail === true;
  const redirectTo =
    typeof body.redirectTo === "string" && body.redirectTo.startsWith("http")
      ? body.redirectTo
      : undefined;

  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "Valid email required" }, { status: 422 });
  if (!role)
    return NextResponse.json({ error: 'Role must be "employee" or "client"' }, { status: 422 });
  if (!sendEmail && password.length < 6)
    return NextResponse.json(
      { error: "Set a temporary password (min 6 chars), or tick Send welcome email" },
      { status: 422 }
    );
  const effectivePassword = password.length >= 6 ? password : `${crypto.randomUUID()}Aa1!`;

  let userId: string | null = null;
  let emailed = false;
  let emailNote: string | null = null;

  if (sendEmail) {
    // Create unconfirmed user, then send invite link via Resend (no Supabase mail quota used).
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password: effectivePassword,
      email_confirm: false,
      user_metadata: { name, role },
    });
    if (createErr || !created?.user) {
      const m = (createErr?.message ?? "").toLowerCase();
      if (m.includes("already"))
        return NextResponse.json({ error: "This email is already registered" }, { status: 409 });
      return NextResponse.json({ error: createErr?.message ?? "Could not create user" }, { status: 400 });
    }
    userId = created.user.id;

    // generateLink does NOT send an email — we deliver it via Resend below.
    const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
      type: "invite",
      email,
      ...(redirectTo ? { options: { redirectTo } } : {}),
    });
    const inviteLink = (
      linkData as unknown as { properties?: { action_link?: string } } | null
    )?.properties?.action_link;

    if (!linkErr && inviteLink) {
      const sendErr = await sendViaResend(email, name, inviteLink, true);
      if (!sendErr) {
        emailed = true;
      } else {
        emailNote = sendErr;
      }
    } else {
      emailNote = linkErr?.message ?? "Could not generate invite link — account created but no email sent.";
    }
  }

  if (!userId) {
    // Instant-login: pre-confirmed, no email sent.
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password: effectivePassword,
      email_confirm: true,
      user_metadata: { name, role },
    });
    if (createErr || !created?.user) {
      const m = (createErr?.message ?? "").toLowerCase();
      if (m.includes("already"))
        return NextResponse.json({ error: "This email is already registered" }, { status: 409 });
      return NextResponse.json({ error: createErr?.message ?? "Could not create user" }, { status: 400 });
    }
    userId = created.user.id;
  }

  const { error: profErr } = await svc.from("users").insert([
    { id: userId, firm_id: firmId, email, name, role },
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

  // Shareable magic link — only generated for instant-login accounts (no invite pending).
  let loginLink: string | null = null;
  if (!emailed) {
    try {
      const { data: linkData } = await svc.auth.admin.generateLink({
        type: "magiclink",
        email,
        ...(redirectTo ? { options: { redirectTo } } : {}),
      });
      const props = (linkData as unknown as { properties?: { action_link?: string } } | null)
        ?.properties;
      if (props?.action_link) loginLink = props.action_link;
    } catch { /* bonus */ }
  }

  return NextResponse.json(
    {
      data: { id: userId, email, name, role, email_confirmed: emailed ? false : true },
      emailed,
      emailNote,
      loginLink,
      warning: clientWarning,
    },
    { status: 201 }
  );
}
