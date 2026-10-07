import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/supabase/service";
import { getTicketViewer, logHistory, logActivity, sendTicketEmail, staffEmails } from "@/lib/tickets-server";
import { CLIENT_CATEGORIES, EMPLOYEE_CATEGORIES, canSeeTicket } from "@/lib/tickets";

const createSchema = z.object({
  subject: z.string().trim().min(5, "Subject needs at least 5 characters").max(200),
  category: z.string().min(1),
  project_label: z.string().max(200).nullable().optional(),
  priority: z.enum(["Low", "Medium", "High", "Urgent"]).default("Medium"),
  description: z.string().trim().min(1, "Problem description is required").max(10000),
  attachment_url: z.string().max(2000).nullable().optional(),
  attachment_name: z.string().max(255).nullable().optional(),
});

/** GET /api/tickets — role-filtered list. Client=own, employee=own+client tickets, admin=all. */
export async function GET(req: Request) {
  const gate = await getTicketViewer();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { viewer, svc } = gate;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const category = url.searchParams.get("category");
  const source = url.searchParams.get("source"); // client | employee
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let q = svc.from("tickets").select("*").eq("firm_id", viewer.firmId).order("updated_at", { ascending: false }).limit(300);
  if (status && status !== "all") q = q.eq("status", status);
  if (priority && priority !== "all") q = q.eq("priority", priority);
  if (category && category !== "all") q = q.eq("category", category);
  if (source && source !== "all") q = q.eq("created_by_role", source);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  let rows = (data ?? []) as Record<string, unknown>[];

  // Role scoping (API-level enforcement, not just UI hiding)
  if (viewer.role === "client") {
    rows = rows.filter((t) => t.created_by_id === viewer.id);
  } else if (viewer.role === "employee") {
    rows = rows.filter((t) => canSeeTicket(
      t as { created_by_id?: string | null; created_by_role: string; assigned_to?: string | null },
      { id: viewer.id, role: viewer.role }
    ));
  }

  if (search) {
    rows = rows.filter((t) =>
      [t.ticket_no, t.subject, t.description].filter(Boolean).join(" ").toLowerCase().includes(search)
    );
  }

  // Attach display names (best-effort)
  const ids = [...new Set(rows.flatMap((t) => [t.created_by_id, t.assigned_to]).filter(Boolean) as string[])];
  let names = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await svc.from("users").select("id,name").in("id", ids);
    names = new Map(((users ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));
  }
  const out = rows.map((t) => ({
    ...t,
    creator_name: (t.created_by_id ? names.get(t.created_by_id as string) : null) ?? null,
    assigned_name: (t.assigned_to ? names.get(t.assigned_to as string) : null) ?? null,
  }));
  return NextResponse.json({ data: out });
}

/** POST /api/tickets — create. Generates EMP-0001/CLT-0001 via DB trigger. */
export async function POST(req: Request) {
  const gate = await getTicketViewer();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { viewer, svc } = gate;

  const retryAfter = rateLimit(`ticket-create:${viewer.id}`, 10, 60 * 60 * 1000);
  if (retryAfter > 0) return NextResponse.json({ error: `Rate limited — try again in ${retryAfter}s` }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const v = parsed.data;

  // Category must match role list
  const allowed = viewer.role === "client" ? CLIENT_CATEGORIES : viewer.role === "employee" ? EMPLOYEE_CATEGORIES : [...CLIENT_CATEGORIES, ...EMPLOYEE_CATEGORIES];
  if (!allowed.includes(v.category)) return NextResponse.json({ error: `Invalid category for ${viewer.role}` }, { status: 422 });

  // Attachment: validate type by extension + cap URL length (size checked at upload time in UI)
  if (v.attachment_url && !/\.(png|jpe?g|webp|gif|pdf)(\?|$)/i.test(v.attachment_url) && !v.attachment_url.startsWith("data:")) {
    return NextResponse.json({ error: "Attachments must be images or PDFs" }, { status: 422 });
  }

  // Resolve client_id for client creators
  let clientId: string | null = null;
  if (viewer.role === "client") {
    const { data: c } = await svc.from("clients").select("id").eq("linked_user_id", viewer.id).limit(1).maybeSingle();
    clientId = (c as { id?: string } | null)?.id ?? null;
  }

  const { data: inserted, error } = await svc.from("tickets").insert([{
    firm_id: viewer.firmId,
    created_by_id: viewer.id,
    created_by_role: viewer.role === "admin" ? "client" : viewer.role,
    client_id: clientId,
    project_label: v.project_label ?? null,
    subject: v.subject,
    category: v.category,
    priority: v.priority,
    description: v.description,
    status: "Open",
    attachment_url: v.attachment_url ?? null,
    attachment_name: v.attachment_name ?? null,
    ticket_no: "", // trigger fills EMP-/CLT- number
  }]).select("*").single();
  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "Could not create ticket" }, { status: 400 });
  const t = inserted as { id: string; ticket_no: string };

  await logHistory(svc, t.id, "created", viewer.id, null, "Open");
  await logActivity(svc, viewer.firmId, viewer.id, `created ticket ${t.ticket_no}`, t.id);

  // Notify: client ticket → admins + employees; employee ticket → admins only
  const recipients = viewer.role === "client"
    ? await staffEmails(svc, viewer.firmId, true)
    : await staffEmails(svc, viewer.firmId, false);
  void sendTicketEmail(recipients, `New ${viewer.role} ticket ${t.ticket_no}`, `<p><strong>${viewer.name}</strong> opened ticket <strong>${t.ticket_no}</strong>: ${v.subject}</p>`);

  return NextResponse.json({ data: inserted }, { status: 201 });
}
