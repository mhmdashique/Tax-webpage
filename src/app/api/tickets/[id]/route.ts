import { NextResponse } from "next/server";
import { getTicketViewer, userName } from "@/lib/tickets-server";
import { canSeeTicket } from "@/lib/tickets";

/** GET /api/tickets/:id — detail + comments (internal hidden from clients) + history. DELETE — admin only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await getTicketViewer();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { viewer, svc } = gate;

  const { data: t, error } = await svc.from("tickets").select("*").eq("id", id).single();
  if (error || !t) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  const ticket = t as Record<string, unknown> & { firm_id?: string; created_by_id?: string | null; created_by_role: string; assigned_to?: string | null };
  if (ticket.firm_id !== viewer.firmId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canSeeTicket(ticket, { id: viewer.id, role: viewer.role })) return NextResponse.json({ error: "Forbidden", }, { status: 403 });

  const cRes = await svc.from("ticket_comments").select("*").eq("ticket_id", id).order("created_at", { ascending: true }).limit(500);
  const hRes = await svc.from("ticket_history").select("*").eq("ticket_id", id).order("created_at", { ascending: true }).limit(500);
  let list = ((cRes.data ?? []) as Record<string, unknown>[]);
  // Hide internal notes from clients at the API level
  if (viewer.role === "client") list = list.filter((c) => !c.is_internal);

  const uids = [...new Set([
    ...list.map((c) => c.user_id),
    ...(hRes.data ?? []).map((h: Record<string, unknown>) => h.changed_by),
    ticket.created_by_id, ticket.assigned_to, ticket.closed_by,
  ].filter(Boolean) as string[])];
  let names = new Map<string, { name: string }>();
  if (uids.length) {
    const { data: users } = await svc.from("users").select("id,name,role").in("id", uids);
    names = new Map(((users ?? []) as { id: string; name: string; role: string }[]).map((u) => [u.id, { name: u.name }]));
  }
  const roles = new Map<string, string>();
  if (uids.length) {
    const { data: users } = await svc.from("users").select("id,role").in("id", uids);
    for (const u of ((users ?? []) as { id: string; role: string }[])) roles.set(u.id, u.role);
  }
  void userName;

  return NextResponse.json({
    data: {
      ...ticket,
      creator_name: ticket.created_by_id ? names.get(ticket.created_by_id as string)?.name ?? null : null,
      assigned_name: ticket.assigned_to ? names.get(ticket.assigned_to as string)?.name ?? null : null,
      comments: list.map((c) => ({
        ...c,
        user_name: c.user_id ? names.get(c.user_id as string)?.name ?? null : null,
        user_role: c.user_id ? roles.get(c.user_id as string) ?? null : null,
      })),
      history: ((hRes.data ?? []) as Record<string, unknown>[]).map((h) => ({
        ...h,
        changed_by_name: h.changed_by ? names.get(h.changed_by as string)?.name ?? null : null,
      })),
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const gate = await getTicketViewer();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { viewer, svc } = gate;
  if (viewer.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const { data: t } = await svc.from("tickets").select("firm_id").eq("id", id).single();
  if (!t || (t as { firm_id?: string }).firm_id !== viewer.firmId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error } = await svc.from("tickets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
