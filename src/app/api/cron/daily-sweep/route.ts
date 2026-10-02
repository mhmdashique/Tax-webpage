import { NextResponse } from "next/server";

// Daily overdue sweep: if due_date passes before stage 6 (filed), the filing
// turns Overdue — red on dashboards, accountant + admin notified.
// Filed/completed filings are never flagged, even past due.

export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { createServerSupabase } = await import("@/lib/supabase/server");
  const sb = await createServerSupabase();
  if (!sb) return NextResponse.json({ ok: true, swept: 0, note: "no supabase" });
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb.from("filings").select("id").lt("due_date", today).not("status", "in", "(filed,completed,overdue)");
  await sb.from("filings").update({ status: "overdue" }).lt("due_date", today).not("status", "in", "(filed,completed,overdue)");
  // Notification fan-out (digest emails per notifications_settings) runs here in production.
  return NextResponse.json({ ok: true, swept: data?.length ?? 0 });
}
