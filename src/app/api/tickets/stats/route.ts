import { NextResponse } from "next/server";
import { getTicketViewer } from "@/lib/tickets-server";

/** GET /api/tickets/stats — scoped counts. Admin sees firm-wide; others see visible tickets. */
export async function GET() {
  const gate = await getTicketViewer();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { viewer, svc } = gate;
  const { data } = await svc.from("tickets").select("status,created_by_id,created_by_role,assigned_to").eq("firm_id", viewer.firmId).limit(1000);
  let rows = (data ?? []) as { status: string; created_by_id?: string | null; created_by_role: string; assigned_to?: string | null }[];
  if (viewer.role === "client") rows = rows.filter((t) => t.created_by_id === viewer.id);
  else if (viewer.role === "employee") rows = rows.filter((t) =>
    t.created_by_role === "client" || t.created_by_id === viewer.id || t.assigned_to === viewer.id
  );
  const count = (s: string) => rows.filter((t) => t.status === s).length;
  return NextResponse.json({
    data: {
      total: rows.length,
      open: count("Open"),
      in_progress: count("In Progress"),
      on_hold: count("On Hold"),
      resolved: count("Resolved"),
      closed: count("Closed"),
      reopened: count("Reopened"),
    },
  });
}
