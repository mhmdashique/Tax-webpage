import { createServiceClient } from "@/lib/supabase/service";
import { createServerSupabase } from "@/lib/supabase/server";
import { canCloseTicket, canSeeTicket, canChangeStatus } from "@/lib/tickets";

export interface TicketViewer { id: string; role: string; firmId: string; name: string; email?: string }

type Svc = NonNullable<ReturnType<typeof createServiceClient>>;

/** Identify caller + load role/firm/name via service role (bypasses RLS). */
export async function getTicketViewer(): Promise<
  | { error: string; status: 401 | 403 | 503 }
  | { viewer: TicketViewer; svc: Svc }
> {
  const anon = await createServerSupabase();
  if (!anon) return { error: "Supabase not configured", status: 503 };
  const { data: { user: caller } } = await anon.auth.getUser();
  if (!caller) return { error: "Not signed in", status: 401 };
  const svc = createServiceClient();
  if (!svc) return { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY", status: 503 };
  const { data: row } = await svc.from("users")
    .select("role,firm_id,approval_status,name,email")
    .eq("id", caller.id).single();
  const r = row as { role?: string; firm_id?: string; approval_status?: string; name?: string; email?: string } | null;
  if (!r || !r.role || !r.firm_id) return { error: "Profile not found", status: 403 };
  if (r.role !== "admin" && r.approval_status !== "approved") return { error: "Account pending approval", status: 403 };
  return { viewer: { id: caller.id, role: r.role, firmId: r.firm_id, name: r.name ?? caller.email ?? "User", email: r.email ?? caller.email ?? undefined }, svc };
}

export async function logHistory(
  svc: Svc, ticketId: string, action: string, changedBy: string,
  oldValue?: string | null, newValue?: string | null
) {
  await svc.from("ticket_history").insert([{
    ticket_id: ticketId, action, old_value: oldValue ?? null, new_value: newValue ?? null, changed_by: changedBy,
  }]).then(() => {}, () => {});
}

export async function logActivity(svc: Svc, firmId: string, actorId: string, actorName: string, action: string, ticketId: string) {
  await svc.from("activity_log").insert([{
    firm_id: firmId, actor_id: actorId, actor_name: actorName, action, entity_type: "ticket", entity_id: ticketId,
  }]).then(() => {}, () => {});
}

/** Best-effort email via Resend; never throws. */
export async function sendTicketEmail(to: string[], subject: string, html: string) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key || to.length === 0) return;
    const { Resend } = await import("resend");
    const resend = new Resend(key);
    const from = process.env.RESEND_FROM ?? "TaxDesk <onboarding@resend.dev>";
    await resend.emails.send({ from, to: to.slice(0, 10), subject, html });
  } catch { /* notifications must not fail the request */ }
}

/** Emails of admins (+ optionally employees) in a firm. */
export async function staffEmails(svc: Svc, firmId: string, includeEmployees: boolean): Promise<string[]> {
  const roles = includeEmployees ? ["admin", "employee"] : ["admin"];
  const { data } = await svc.from("users").select("email,role").eq("firm_id", firmId).in("role", roles);
  return ((data ?? []) as { email: string }[]).map((u) => u.email).filter(Boolean);
}

export async function userEmail(svc: Svc, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await svc.from("users").select("email").eq("id", userId).maybeSingle();
  return (data as { email?: string } | null)?.email ?? null;
}

export async function userName(svc: Svc, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const { data } = await svc.from("users").select("name").eq("id", userId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}

export { canCloseTicket, canSeeTicket, canChangeStatus };
