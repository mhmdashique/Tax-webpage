import { DashboardShell } from "@/components/shell";
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell role="client" name="Acme Ltd">{children}</DashboardShell>;
}
