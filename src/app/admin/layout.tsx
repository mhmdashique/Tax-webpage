import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { getLayoutGate } from "@/lib/supabase/service";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const gate = await getLayoutGate();
  if (!gate.user) redirect("/login");

  const { role, approvalStatus, name } = gate.user;
  if (role !== "admin") {
    // Pending/rejected non-admins never see the inside of the app.
    if (approvalStatus === "rejected") redirect("/access-denied");
    if (approvalStatus !== "approved") redirect("/pending-approval");
    redirect(role ? `/${role}/dashboard` : "/login");
  }

  return <DashboardShell role="admin" name={name}>{children}</DashboardShell>;
}
