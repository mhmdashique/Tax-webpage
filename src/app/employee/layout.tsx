import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const sb = await createServerSupabase();
  if (!sb) redirect("/login");

  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const role = (user.user_metadata?.role as string) ?? null;
  if (role !== "employee") redirect(role ? `/${role}/dashboard` : "/login");

  const name = (user.user_metadata?.name as string) ?? user.email ?? "Employee";
  return <DashboardShell role="employee" name={name}>{children}</DashboardShell>;
}
