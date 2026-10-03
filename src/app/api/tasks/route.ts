import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/supabase/service";
import { z } from "zod";

const taskAssignmentSchema = z.object({
  task_type_id: z.string().uuid(),
  task_for: z.enum(["employee", "client"]),
  title: z.string().trim().min(1).max(200),
  related_client_id: z.string().uuid().nullable().optional(),
  related_filing_id: z.string().uuid().nullable().optional(),
  document_id: z.string().uuid().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  follow_up_owner: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  due_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  save_unassigned: z.boolean().default(false),
  notify_client: z.boolean().default(true),
});

export async function GET() {
  const gate = await requireApprovedUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { sb } = gate;
  const { data, error } = await sb.from("tasks").select("*").order("due_date").limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = taskAssignmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const gate = await requireApprovedUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { sb } = gate;
  const task = parsed.data;
  const { data, error } = await sb.rpc("create_task_for_assignment", {
    p_task_type: task.task_type_id,
    p_task_for: task.task_for,
    p_title: task.title,
    p_client: task.related_client_id ?? null,
    p_filing: task.related_filing_id ?? null,
    p_document: task.document_id ?? null,
    p_assignee: task.assigned_to ?? null,
    p_follow_up_owner: task.follow_up_owner ?? null,
    p_priority: task.priority,
    p_due_date: task.due_date ?? null,
    p_notes: task.notes ?? null,
    p_save_unassigned: task.save_unassigned,
    p_notify_client: task.notify_client,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data: { id: data } }, { status: 201 });
}
