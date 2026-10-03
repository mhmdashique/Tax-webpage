import { Resend } from "resend";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  if (!svc) return NextResponse.json({ error: "Supabase service client is not configured" }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: overdueRows, error: overdueReadError } = await svc.from("filings")
    .select("id")
    .lt("due_date", today)
    .not("status", "in", "(filed,completed,overdue)")
    .limit(500);
  if (overdueReadError) return NextResponse.json({ error: overdueReadError.message }, { status: 500 });

  if (overdueRows?.length) {
    const { error: overdueUpdateError } = await svc.from("filings")
      .update({ status: "overdue" })
      .in("id", overdueRows.map((filing) => filing.id));
    if (overdueUpdateError) return NextResponse.json({ error: overdueUpdateError.message }, { status: 500 });
  }

  const { data: overdueNotifications, error: queueError } = await svc.rpc("gst_queue_overdue_notifications");
  if (queueError) return NextResponse.json({ error: queueError.message }, { status: 500 });
  const { data: overdueTasksQueued, error: taskQueueError } = await svc.rpc("queue_overdue_task_notifications");
  if (taskQueueError) return NextResponse.json({ error: taskQueueError.message }, { status: 500 });

  const { data: gstNotifications, error: gstReadError } = await svc.from("gst_payment_notifications")
    .select("id,recipient_email,event_type,message")
    .is("email_sent_at", null)
    .lte("scheduled_for", today)
    .order("scheduled_for")
    .limit(100);
  if (gstReadError) return NextResponse.json({ error: gstReadError.message }, { status: 500 });
  const { data: taskNotifications, error: taskReadError } = await svc.from("task_notifications")
    .select("id,recipient_email,event_type,message")
    .is("email_sent_at", null)
    .order("created_at")
    .limit(100);
  if (taskReadError) return NextResponse.json({ error: taskReadError.message }, { status: 500 });
  const notifications = [
    ...(gstNotifications ?? []).map((notification) => ({ ...notification, source: "gst" as const })),
    ...(taskNotifications ?? []).map((notification) => ({ ...notification, source: "task" as const })),
  ];

  if (!notifications?.length) {
    return NextResponse.json({
      ok: true,
      swept: overdueRows?.length ?? 0,
      overdueNotifications: overdueNotifications ?? 0,
      overdueTasksQueued: overdueTasksQueued ?? 0,
      emailsSent: 0,
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "re_your_api_key_here") {
    return NextResponse.json({
      error: "Email notifications are queued, but RESEND_API_KEY is not configured",
      queued: notifications.length,
      inAppNotificationsAvailable: true,
    }, { status: 503 });
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM ?? "TaxDesk <onboarding@resend.dev>";
  const failures: string[] = [];
  let emailsSent = 0;
  for (const notification of notifications) {
    const { error: sendError } = await resend.emails.send({
      from,
      to: notification.recipient_email,
      subject: `TaxDesk ${notification.source === "task" ? "task" : "GST"} update: ${notification.event_type.replace(/_/g, " ")}`,
      text: notification.message,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px"><p>${escapeHtml(notification.message)}</p><p>Sign in to TaxDesk to review the ${notification.source === "task" ? "task" : "filing payment"} details.</p></div>`,
    });
    if (sendError) {
      failures.push(`${notification.id}: ${sendError.message}`);
      continue;
    }

    const { error: sentMarkError } = await svc.from(notification.source === "task" ? "task_notifications" : "gst_payment_notifications")
      .update({ email_sent_at: new Date().toISOString() })
      .eq("id", notification.id)
      .is("email_sent_at", null);
    if (sentMarkError) failures.push(`${notification.id}: email sent but could not mark delivery: ${sentMarkError.message}`);
    else emailsSent++;
  }

  if (failures.length) {
    return NextResponse.json({
      error: "Some notification emails could not be fully delivered",
      failures,
      emailsSent,
      overdueNotifications: overdueNotifications ?? 0,
      overdueTasksQueued: overdueTasksQueued ?? 0,
    }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    swept: overdueRows?.length ?? 0,
    overdueNotifications: overdueNotifications ?? 0,
    overdueTasksQueued: overdueTasksQueued ?? 0,
    emailsSent,
  });
}
