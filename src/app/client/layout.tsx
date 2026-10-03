import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/shell";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const sb = await createServerSupabase();
  if (!sb) redirect("/login");

  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const role = (user.user_metadata?.role as string) ?? null;
  if (role !== "client") redirect(role ? `/${role}/dashboard` : "/login");

  const name = (user.user_metadata?.name as string) ?? user.email ?? "Client";
  return <DashboardShell role="client" name={name}>{children}</DashboardShell>;
}
