import { NextResponse } from "next/server";
import { z } from "zod";
import { getTicketViewer, logHistory, logActivity, sendTicketEmail, userEmail } from "@/lib/tickets-server";
import { canCloseTicket, canSeeTicket, canReopen } from "@/lib/tickets";

const closeSchema = z.object({ closing_remark: z.string().trim().min(3, "A closing remark is required").max(2000) });

/**
 * PATCH /api/tickets/:id/close
 * Body: { closing_remark } → close | { reopen: true } → reopen within 7 days.
 * Client ticket: employee + admin. Employee ticket: admin only.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await getTicketViewer();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { viewer, svc } = gate;

  const body = await req.json().catch(() => ({}));
  const { data: t } = await svc.from("tickets").select("*").eq("id", id).single();
  if (!t) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  const ticket = t as {
    firm_id?: string; status: string; created_by_id?: string | null; created_by_role: string;
    assigned_to?: string | null; ticket_no: string; closed_at?: string | null;
  };
  if (ticket.firm_id !== viewer.firmId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canSeeTicket(ticket, { id: viewer.id, role: viewer.role })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Reopen path
  if (body?.reopen === true) {
    if (ticket.status !== "Closed") return NextResponse.json({ error: "Only closed tickets can be reopened" }, { status: 409 });
    if (!canReopen(ticket.closed_at)) return NextResponse.json({ error: "Reopen window (7 days) has expired" }, { status: 410 });
    // Clients may confirm/reopen their own; staff may reopen anything they see
    if (viewer.role === "client" && ticket.created_by_id !== viewer.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { error } = await svc.from("tickets")
      .update({ status: "Reopened", closed_by: null, closed_at: null, closing_remark: null }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logHistory(svc, id, "reopened", viewer.id, "Closed", "Reopened");
    await logActivity(svc, viewer.firmId, viewer.id, `reopened ticket ${ticket.ticket_no}`, id);
    const creator = await userEmail(svc, ticket.created_by_id);
    void sendTicketEmail(creator && creator !== viewer.email ? [creator] : [], `Ticket ${ticket.ticket_no} reopened`,
      `<p>Ticket <strong>${ticket.ticket_no}</strong> was reopened by ${viewer.name}.</p>`);
    return NextResponse.json({ ok: true, status: "Reopened" });
  }

  // Close path
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A closing remark is required" }, { status: 422 });
  if (ticket.status === "Closed") return NextResponse.json({ error: "Already closed" }, { status: 409 });
  if (!canCloseTicket(ticket, { id: viewer.id, role: viewer.role })) {
    return NextResponse.json({ error: ticket.created_by_role === "employee" ? "Only an admin can close employee tickets" : "Only support staff can close this ticket" }, { status: 403 });
  }
  const { error } = await svc.from("tickets").update({
    status: "Closed", closed_by: viewer.id, closed_at: new Date().toISOString(), closing_remark: parsed.data.closing_remark,
  }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logHistory(svc, id, "closed", viewer.id, ticket.status, "Closed");
  await logActivity(svc, viewer.firmId, viewer.id, `closed ticket ${ticket.ticket_no}`, id);

  const creator = await userEmail(svc, ticket.created_by_id);
  const assignee = await userEmail(svc, ticket.assigned_to);
  void sendTicketEmail([creator, assignee].filter((e): e is string => !!e && e !== viewer.email),
    `Ticket ${ticket.ticket_no} closed`,
    `<p>Ticket <strong>${ticket.ticket_no}</strong> was closed by ${viewer.name}. Remark: ${parsed.data.closing_remark}</p>`);

  return NextResponse.json({ ok: true, status: "Closed" });
}
