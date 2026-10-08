import { NextResponse } from "next/server";
import { z } from "zod";
import { getTicketViewer, logHistory, logActivity, sendTicketEmail, userEmail } from "@/lib/tickets-server";

const schema = z.object({ assigned_to: z.string().uuid().nullable() });

/** PATCH /api/tickets/:id/assign — admin only. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await getTicketViewer();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { viewer, svc } = gate;
  if (viewer.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid assignee" }, { status: 422 });

  const { data: t } = await svc.from("tickets").select("*").eq("id", id).single();
  if (!t) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  const ticket = t as { firm_id?: string; assigned_to?: string | null; ticket_no: string };
  if (ticket.firm_id !== viewer.firmId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.assigned_to) {
    const { data: emp } = await svc.from("users").select("id,role,firm_id")
      .eq("id", parsed.data.assigned_to).single();
    const e = emp as { role?: string; firm_id?: string } | null;
    if (!e || e.firm_id !== viewer.firmId || !["employee", "admin"].includes(e.role ?? "")) {
      return NextResponse.json({ error: "Assignee must be an employee in your firm" }, { status: 422 });
    }
  }

  const { error } = await svc.from("tickets").update({ assigned_to: parsed.data.assigned_to }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await logHistory(svc, id, "assigned", viewer.id, ticket.assigned_to ?? null, parsed.data.assigned_to);
  await logActivity(svc, viewer.firmId, viewer.id, viewer.name, `assigned ticket ${ticket.ticket_no} by ${viewer.name}`, id);

  const assignee = await userEmail(svc, parsed.data.assigned_to);
  void sendTicketEmail(assignee ? [assignee] : [], `Ticket ${ticket.ticket_no} assigned to you`,
    `<p>Ticket <strong>${ticket.ticket_no}</strong> was assigned to you by ${viewer.name}.</p>`);

  return NextResponse.json({ ok: true });
}
