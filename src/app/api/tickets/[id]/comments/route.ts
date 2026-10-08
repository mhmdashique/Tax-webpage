import { NextResponse } from "next/server";
import { z } from "zod";
import { getTicketViewer, logActivity, sendTicketEmail, userEmail } from "@/lib/tickets-server";
import { canSeeTicket } from "@/lib/tickets";

const schema = z.object({
  message: z.string().trim().min(1, "Reply is required").max(5000),
  is_internal: z.boolean().default(false),
});

/** POST /api/tickets/:id/comments — anyone who can see the ticket; internal = staff only, hidden from clients. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await getTicketViewer();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { viewer, svc } = gate;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid comment" }, { status: 422 });

  const { data: t } = await svc.from("tickets").select("*").eq("id", id).single();
  if (!t) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  const ticket = t as { firm_id?: string; status: string; created_by_id?: string | null; created_by_role: string; assigned_to?: string | null; ticket_no: string };
  if (ticket.firm_id !== viewer.firmId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canSeeTicket(ticket, { id: viewer.id, role: viewer.role })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ticket.status === "Closed") return NextResponse.json({ error: "Ticket is closed — reopen it first" }, { status: 409 });
  if (parsed.data.is_internal && viewer.role === "client") return NextResponse.json({ error: "Clients cannot post internal notes" }, { status: 403 });

  const { data: inserted, error } = await svc.from("ticket_comments").insert([{
    ticket_id: id, user_id: viewer.id, message: parsed.data.message, is_internal: parsed.data.is_internal,
  }]).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await svc.from("ticket_history").insert([{
    ticket_id: id, action: parsed.data.is_internal ? "internal_note" : "replied", changed_by: viewer.id,
  }]).then(() => {}, () => {});
  await logActivity(svc, viewer.firmId, viewer.id, viewer.name, `${parsed.data.is_internal ? "noted on" : "replied to"} ticket ${ticket.ticket_no} by ${viewer.name}`, id);

  // Notify the other side (never leak internal notes to the client)
  const targets = new Set<string>();
  if (!parsed.data.is_internal) {
    const creator = await userEmail(svc, ticket.created_by_id);
    if (creator) targets.add(creator);
  }
  const assignee = await userEmail(svc, ticket.assigned_to);
  if (assignee) targets.add(assignee);
  targets.delete(viewer.email ?? "");
  if (!parsed.data.is_internal || viewer.role === "admin") {
    void sendTicketEmail([...targets], `Update on ticket ${ticket.ticket_no}`,
      `<p><strong>${viewer.name}</strong> replied on ticket <strong>${ticket.ticket_no}</strong>.</p>`);
  }

  return NextResponse.json({ data: inserted }, { status: 201 });
}
