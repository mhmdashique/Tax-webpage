import { NextResponse } from "next/server";
import { z } from "zod";
import { getTicketViewer, logHistory, logActivity, sendTicketEmail, userEmail } from "@/lib/tickets-server";
import { TICKET_STATUSES, canChangeStatus, canSeeTicket } from "@/lib/tickets";

const schema = z.object({ status: z.enum(["Open", "In Progress", "On Hold", "Resolved", "Reopened"]) });

/** PATCH /api/tickets/:id/status — staff transitions (clients: use close/reopen endpoints only). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await getTicketViewer();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { viewer, svc } = gate;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 422 });

  const { data: t } = await svc.from("tickets").select("*").eq("id", id).single();
  if (!t) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  const ticket = t as { firm_id?: string; status: string; created_by_id?: string | null; created_by_role: string; assigned_to?: string | null; ticket_no: string };
  if (ticket.firm_id !== viewer.firmId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canSeeTicket(ticket, { id: viewer.id, role: viewer.role })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ticket.status === "Closed") return NextResponse.json({ error: "Ticket is closed — reopen it first" }, { status: 409 });
  if (!canChangeStatus(ticket, { role: viewer.role })) return NextResponse.json({ error: "Only support staff can change status" }, { status: 403 });
  if (!TICKET_STATUSES.includes(parsed.data.status)) return NextResponse.json({ error: "Invalid status" }, { status: 422 });

  const { error } = await svc.from("tickets").update({ status: parsed.data.status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logHistory(svc, id, "status_changed", viewer.id, ticket.status, parsed.data.status);
  await logActivity(svc, viewer.firmId, viewer.id, `moved ticket ${ticket.ticket_no} to ${parsed.data.status}`, id);

  const creator = await userEmail(svc, ticket.created_by_id);
  const assignee = await userEmail(svc, ticket.assigned_to);
  void sendTicketEmail([creator, assignee].filter((e): e is string => !!e && e !== viewer.email),
    `Ticket ${ticket.ticket_no} → ${parsed.data.status}`,
    `<p>Ticket <strong>${ticket.ticket_no}</strong> moved from ${ticket.status} to <strong>${parsed.data.status}</strong> by ${viewer.name}.</p>`);

  return NextResponse.json({ ok: true, status: parsed.data.status });
}
