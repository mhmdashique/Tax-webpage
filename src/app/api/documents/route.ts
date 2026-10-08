import { NextResponse } from "next/server";
import { requireApprovedUser } from "@/lib/supabase/service";

export async function GET(req: Request) {
  const gate = await requireApprovedUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { sb } = gate;
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");
  let q = sb.from("documents").select("*").order("created_at", { ascending: false }).limit(50);
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body.file_name || !body.file_url) return NextResponse.json({ error: "file_name and file_url required" }, { status: 422 });
  const gate = await requireApprovedUser();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { sb } = gate;
  const { data, error } = await sb.from("documents").insert([{ file_name: body.file_name, file_url: body.file_url, client_id: body.client_id ?? null, filing_id: body.filing_id ?? null, shared_with_client: true, uploaded_by: gate.userId }]).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
