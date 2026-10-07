import type { Role } from "@/types/database";

export type TicketStatus = "Open" | "In Progress" | "On Hold" | "Resolved" | "Closed" | "Reopened";
export type TicketPriority = "Low" | "Medium" | "High" | "Urgent";

export interface Ticket {
  id: string;
  ticket_no: string;
  firm_id?: string | null;
  created_by_id?: string | null;
  created_by_role: string;
  client_id?: string | null;
  project_label?: string | null;
  subject: string;
  category: string;
  priority: TicketPriority | string;
  description: string;
  status: TicketStatus | string;
  assigned_to?: string | null;
  assigned_name?: string | null;
  creator_name?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  closed_by?: string | null;
  closed_at?: string | null;
  closing_remark?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  user_id?: string | null;
  user_name?: string | null;
  user_role?: string | null;
  message: string;
  is_internal: boolean;
  created_at?: string;
}

export interface TicketHistoryRow {
  id: string;
  ticket_id: string;
  action: string;
  old_value?: string | null;
  new_value?: string | null;
  changed_by?: string | null;
  changed_by_name?: string | null;
  created_at?: string;
}

export const TICKET_STATUSES: TicketStatus[] = ["Open", "In Progress", "On Hold", "Resolved", "Closed", "Reopened"];
export const TICKET_PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Urgent"];
export const EMPLOYEE_CATEGORIES = ["IT", "HR", "Payroll", "Leave/Attendance", "Facilities", "Other"];
export const CLIENT_CATEGORIES = ["Bug/Issue", "Service Request", "Billing", "Feedback", "Other"];

// Spec badge colors: Open blue, In Progress orange, On Hold grey, Resolved green, Closed dark grey, Reopened purple
export const STATUS_BADGE_STYLE: Record<string, { background: string; color: string }> = {
  "Open": { background: "var(--accent-tint)", color: "var(--accent-hover)" },
  "In Progress": { background: "#FFEDD5", color: "#C2410C" },
  "On Hold": { background: "#E5E7EB", color: "#4B5563" },
  "Resolved": { background: "var(--accent-tint)", color: "var(--accent-hover)" },
  "Closed": { background: "#374151", color: "#F9FAFB" },
  "Reopened": { background: "#EDE9FE", color: "#6D28D9" },
};

export const PRIORITY_TONE: Record<string, "danger" | "warning" | "accent" | "neutral"> = {
  Urgent: "danger",
  High: "warning",
  Medium: "accent",
  Low: "neutral",
};

/** Who can SEE this ticket? Mirrors the spec table. */
export function canSeeTicket(
  t: { created_by_id?: string | null; created_by_role: string; assigned_to?: string | null },
  viewer: { id: string; role: Role | string }
): boolean {
  if (viewer.role === "admin") return true;
  if (t.created_by_role === "client") {
    if (viewer.role === "client") return t.created_by_id === viewer.id;
    // employee: assigned OR open support pool
    return true;
  }
  // employee-created: only creator + admin
  return t.created_by_id === viewer.id;
}

/** Who can CLOSE this ticket? Client ticket: employee+admin. Employee ticket: admin only. */
export function canCloseTicket(
  t: { created_by_role: string; created_by_id?: string | null },
  viewer: { id: string; role: Role | string }
): boolean {
  if (viewer.role === "admin") return true;
  if (t.created_by_role === "client" && viewer.role === "employee") return true;
  return false;
}

/** Who can change status (non-close transitions)? Admin always; employee on client tickets; clients never (except reopen). */
export function canChangeStatus(
  t: { created_by_role: string },
  viewer: { role: Role | string }
): boolean {
  if (viewer.role === "admin") return true;
  if (viewer.role === "employee" && t.created_by_role === "client") return true;
  return false;
}

export function isClosedReadOnly(status: string): boolean {
  return status === "Closed";
}

/** Reopen allowed within 7 days of closure. */
export function canReopen(closedAt?: string | null, now = new Date()): boolean {
  if (!closedAt) return false;
  const diffMs = now.getTime() - new Date(closedAt).getTime();
  return diffMs >= 0 && diffMs <= 7 * 864e5;
}
