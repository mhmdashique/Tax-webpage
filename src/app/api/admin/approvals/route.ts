import { NextResponse } from "next/server";
import { rateLimit, requireFirmAdmin } from "@/lib/supabase/service";
import { approvalsQuerySchema } from "@/lib/validators";

export async function GET(req: Request) {
  const retryAfter = rateLimit(`approvals:${req.headers.get("x-forwarded-for") ?? "local"}`, 60, 60_000);
  if (retryAfter > 0) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${retryAfter}s.` },
      { status: 429 }
    );
  }

  const gate = await requireFirmAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { svc, firmId } = gate;

  const { searchParams } = new URL(req.url);
  const parsed = approvalsQuerySchema.safeParse({ status: searchParams.get("status") ?? "pending" });
  if (!parsed.success) {
    return NextResponse.json({ error: "status must be pending, approved or rejected" }, { status: 422 });
  }

  const { data, error } = await svc
    .from("users")
    .select("id, name, email, role, requested_role, approval_status, rejected_reason, created_at, reviewed_at")
    // Pending users may have no firm yet (signed up before the queue existed).
    // Never hide the queue because of a missing firm_id: include NULL-firm rows.
    .or(`firm_id.eq.${firmId},firm_id.is.null`)
    .eq("approval_status", parsed.data.status)
    .neq("role", "admin")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
