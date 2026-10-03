import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/auth/resend-confirmation — PUBLIC (no login required).
 * Body: { email, redirectTo?: string }
 *
 * Sends an account-confirmation link via the Resend platform instead of
 * Supabase's built-in mailer (which is capped at ~2 emails/hour and returns
 * `over_email_send_rate_limit` when the quota is used up).
 *
 * Security notes:
 * - Never returns the `loginLink` — it is only ever sent to the mailbox.
 * - Unknown emails get a generic success response (no enumeration).
 * - Simple per-email rate limit (1/min, 5/hour) to prevent abuse.
 */

const attempts = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 5;
const MIN_INTERVAL_MS = 60 * 1000;

function retryAfterSeconds(email: string): number {
  const now = Date.now();
  const list = (attempts.get(email) ?? []).filter((t) => now - t < WINDOW_MS);
  const last = list[list.length - 1];
  if (last !== undefined && now - last < MIN_INTERVAL_MS) {
    return Math.ceil((MIN_INTERVAL_MS - (now - last)) / 1000);
  }
  if (list.length >= MAX_PER_HOUR) {
    return Math.ceil((WINDOW_MS - (now - list[0])) / 1000);
  }
  list.push(now);
  attempts.set(email, list);
  return 0;
}

async function findAuthUserByEmail(
  svc: NonNullable<ReturnType<typeof createServiceClient>>,
  email: string
) {
  // listUsers is paginated — scan pages until the address is found.
  const perPage = 200;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = (data?.users ?? []) as {
      id: string;
      email?: string;
      email_confirmed_at?: string | null;
      user_metadata?: Record<string, unknown>;
    }[];
    const hit = users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (users.length < perPage) break;
  }
  return null;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const redirectTo =
    typeof body.redirectTo === "string" && body.redirectTo.startsWith("http")
      ? body.redirectTo
      : undefined;
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 422 });
  }

  const wait = retryAfterSeconds(email);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Please wait ${wait}s before requesting another link.` },
      { status: 429 }
    );
  }

  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "Email service unavailable" }, { status: 503 });

  let authUser;
  try {
    authUser = await findAuthUserByEmail(svc, email);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Lookup failed" },
      { status: 500 }
    );
  }
  // Generic response for unknown addresses — avoids email enumeration.
  if (!authUser) {
    return NextResponse.json({
      emailed: false,
      message: "If an account exists for this email, a confirmation link is on its way.",
    });
  }
  if (authUser.email_confirmed_at) {
    return NextResponse.json({ emailed: false, alreadyConfirmed: true });
  }

  // Generate an invite link (no mail sent by Supabase) — we deliver it via Resend.
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type: "invite",
    email,
    ...(redirectTo ? { options: { redirectTo } } : {}),
  });
  const loginLink = (
    linkData as unknown as { properties?: { action_link?: string } } | null
  )?.properties?.action_link;
  if (linkErr || !loginLink) {
    return NextResponse.json(
      { error: linkErr?.message ?? "Could not generate confirmation link" },
      { status: 500 }
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "TaxDesk <onboarding@resend.dev>";
  if (!resendKey || resendKey === "re_your_api_key_here") {
    return NextResponse.json(
      {
        error:
          "Email service is not configured right now — please ask your admin to confirm your account from the Team page.",
      },
      { status: 503 }
    );
  }

  const userName =
    (authUser.user_metadata?.["name"] as string | undefined) ?? email.split("@")[0];
  const resend = new Resend(resendKey);
  const { error: sendErr } = await resend.emails.send({
    from,
    to: email,
    subject: "Confirm your TaxDesk account",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px">Confirm your TaxDesk account</h2>
        <p style="color:#555;margin:0 0 24px">Hi ${userName},</p>
        <p style="color:#555;margin:0 0 24px">
          Click the button below to activate your account and set your password.
          This link expires in <strong>24 hours</strong>.
        </p>
        <a href="${loginLink}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
          Activate my account
        </a>
        <p style="color:#999;font-size:12px;margin:24px 0 0">
          Or copy this link: <a href="${loginLink}" style="color:#2563EB">${loginLink}</a>
        </p>
      </div>`,
    text: `Hi ${userName},\n\nClick the link below to activate your TaxDesk account (expires in 24 hours):\n\n${loginLink}`,
  });

  if (sendErr) {
    return NextResponse.json(
      {
        error: `Could not send the email (${sendErr.message}). Please try again in a minute or ask your admin to confirm your account from the Team page.`,
      },
      { status: 502 }
    );
  }

  // NOTE: the link itself is never returned — it only goes to the mailbox.
  return NextResponse.json({ emailed: true });
}
