export type Role = "admin" | "employee" | "client";
export type FilingStatus =
  | "created"
  | "documents_requested"
  | "documents_received"
  | "in_preparation"
  | "client_review"
  | "filed"
  | "completed"
  | "overdue"
  // legacy v1 aliases (read: normalized via src/lib/lifecycle.ts)
  | "pending"
  | "in_progress"
  | "in_review";
export type TaskStatus = "todo" | "open" | "in_progress" | "done" | "cancelled";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export interface Firm { id: string; name: string; plan_tier?: string; default_currency?: string; timezone?: string; }
export interface AppUser { id: string; firm_id: string; email: string; name: string; role: Role; avatar_url?: string | null; phone?: string | null; approval_status?: ApprovalStatus; requested_role?: Role | string | null; approved_by?: string | null; approved_at?: string | null; rejected_reason?: string | null; reviewed_at?: string | null; created_at?: string; }
export interface Client { id: string; firm_id: string; assigned_employee_id?: string | null; linked_user_id?: string | null; name: string; email: string; business_name?: string | null; entity_type?: string | null; tax_id?: string | null; status: string; verified?: boolean; annual_turnover_previous_fy?: number | null; }
export interface Filing { id: string; firm_id: string; client_id: string; tax_type: string; period: string; due_date: string; status: FilingStatus | string; amount_owed?: number | null; amount_refund?: number | null; filed_at?: string | null; output_gst?: number; eligible_itc?: number; wrongly_utilized_itc?: number; output_gst_cgst?: number | null; output_gst_sgst?: number | null; output_gst_igst?: number | null; eligible_itc_cgst?: number | null; eligible_itc_sgst?: number | null; eligible_itc_igst?: number | null; tax_payable_cgst?: number | null; tax_payable_sgst?: number | null; tax_payable_igst?: number | null; is_nil_return?: boolean; client_name?: string; }
export type ClientTaskProgress = "not_seen" | "seen" | "in_progress" | "done_by_client" | "reviewed" | "cancelled";
export interface Task { id: string; firm_id: string; task_type_id?: string | null; task_for?: "employee" | "client"; follow_up_owner?: string | null; client_visible?: boolean; notify_client?: boolean; last_reminder_at?: string | null; assigned_to?: string | null; created_by?: string | null; related_client_id?: string | null; related_filing_id?: string | null; document_id?: string | null; title: string; status: TaskStatus | string; priority: string; due_date?: string | null; notes?: string | null; cancelled_reason?: string | null; completed_at?: string | null; source?: "manual" | "system"; seen_at?: string | null; seen_by?: string | null; client_status?: ClientTaskProgress | string; reviewed_by?: string | null; reviewed_at?: string | null; reopened_reason?: string | null; last_client_activity_at?: string | null; created_at?: string; }
export interface TaskEvent { id: string; task_id: string; event: "created" | "seen" | "status_changed" | "commented" | "reminder_sent" | "reopened" | "reviewed" | "reassigned" | string; actor_id?: string | null; actor_name?: string; details?: Record<string, unknown> | null; created_at: string; }
export interface Payment { id: string; firm_id: string; client_id: string; invoice_number: string; amount: number; status: string; due_date: string; paid_at?: string | null; }
export interface DocRow { id: string; firm_id: string; client_id: string; filing_id?: string | null; file_name: string; file_url: string; storage_path?: string | null; notes?: string | null; version_no?: number | null; uploaded_by?: string | null; reviewed_by?: string | null; reviewed_at?: string | null; shared_with_client?: boolean; created_at: string; }
export interface DocumentVersion { id: string; document_id: string; version_no: number; file_name: string; file_url: string; storage_path?: string | null; uploaded_by?: string | null; created_at: string; }
export interface ActivityItem { id: string; action: string; entity_type: string; entity_id?: string | null; created_at: string; actor_name?: string; }

// Smart Documents taxonomy (supabase/migrations/0003_checklist.sql)
export interface Jurisdiction { id: string; iso_code: string; name: string; default_currency?: string | null; region?: string | null; parent_id?: string | null; is_active?: boolean; }
export interface TaxType { id: string; code: string; name: string; description?: string | null; }
export interface JurisdictionTaxType { id: string; jurisdiction_id: string; tax_type_id: string; local_name: string; local_form_code?: string | null; filing_frequency?: "monthly" | "quarterly" | "annual" | "event_based" | null; verified?: boolean; source_url?: string | null; last_verified_at?: string | null; }
export interface DocumentRequirement { id: string; tax_type_id?: string | null; jurisdiction_id?: string | null; code: string; name: string; description?: string | null; category: "onboarding" | "filing"; is_mandatory?: boolean; sort_order?: number; verified?: boolean; source_url?: string | null; }
export type ChecklistStatus = "pending" | "uploaded" | "received" | "rejected" | "waived";
export interface ChecklistItem { id: string; filing_id: string; document_requirement_id?: string | null; status: ChecklistStatus | string; document_id?: string | null; rejection_reason?: string | null; reviewed_by?: string | null; reviewed_at?: string | null; requirement?: DocumentRequirement | null; }
