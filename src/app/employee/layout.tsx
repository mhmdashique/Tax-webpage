import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { getLayoutGate } from "@/lib/supabase/service";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const gate = await getLayoutGate();
  if (!gate.user) redirect("/login");

  const { role, approvalStatus, name } = gate.user;
  // Approval is enforced server-side: pending/rejected users never render dashboards.
  if (approvalStatus === "rejected") redirect("/access-denied");
  if (approvalStatus !== "approved") redirect("/pending-approval");
  if (role !== "employee") redirect(role ? `/${role}/dashboard` : "/login");

  return (
    <div className="theme-employee">
      <DashboardShell role="employee" name={name}>{children}</DashboardShell>
    </div>
  );
}
