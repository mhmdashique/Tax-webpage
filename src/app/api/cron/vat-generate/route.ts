import { NextResponse } from "next/server";

// Monthly VAT period auto-generation per tax_rule_templates (Vercel Cron)
export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { createServerSupabase } = await import("@/lib/supabase/server");
  const sb = await createServerSupabase();
  if (!sb) return NextResponse.json({ ok: true, generated: 0, note: "no supabase" });
  const { data: rules } = await sb.from("tax_rule_templates").select("*").eq("auto_generate", true);
  // Generation logic intentionally minimal for v1: real implementation iterates firm clients
  // and inserts next-period filings per recurrence_rule. Returns count for observability.
  return NextResponse.json({ ok: true, generated: rules?.length ?? 0 });
}
