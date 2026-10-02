import { DashboardShell } from "@/components/shell";
export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell role="employee" name="Jonas Lee">{children}</DashboardShell>;
}
