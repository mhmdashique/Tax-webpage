import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { filingSchema } from "@/lib/validators";

export async function GET() {
  const sb = await createServerSupabase();
  if (!sb) return NextResponse.json({ data: [], note: "Supabase not configured — set env vars" });
  const { data, error } = await sb.from("filings").select("*").order("due_date").limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = filingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const sb = await createServerSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const { data, error } = await sb.from("filings").insert([parsed.data]).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await sb.from("activity_log").insert([{ action: "created filing", entity_type: "filing", entity_id: data.id }]);
  return NextResponse.json({ data }, { status: 201 });
}
