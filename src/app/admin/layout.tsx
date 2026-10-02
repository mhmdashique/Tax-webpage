import { DashboardShell } from "@/components/shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell role="admin" name="Amira Khan">{children}</DashboardShell>;
}
