import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/supabase/service";
import { filingSchema } from "@/lib/validators";

export async function GET() {
  const gate = await requireApprovedUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { sb } = gate;
  const { data, error } = await sb.from("filings").select("*").order("due_date").limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = filingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const gate = await requireApprovedUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { sb } = gate;
  const { data, error } = await sb.from("filings").insert([parsed.data]).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: me } = await sb.from("users").select("name").eq("id", gate.userId).maybeSingle();
  const actorName = (me as { name?: string } | null)?.name?.trim() || undefined;
  await sb.from("activity_log").insert([{
    actor_id: gate.userId,
    ...(actorName ? { actor_name: actorName } : {}),
    action: `created filing${actorName ? ` by ${actorName}` : ""}`,
    entity_type: "filing", entity_id: data.id,
  }]);
  return NextResponse.json({ data }, { status: 201 });
}
