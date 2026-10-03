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
export type TaskStatus = "todo" | "in_progress" | "done";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export interface Firm { id: string; name: string; plan_tier?: string; default_currency?: string; timezone?: string; }
export interface AppUser { id: string; firm_id: string; email: string; name: string; role: Role; avatar_url?: string | null; phone?: string | null; approval_status?: ApprovalStatus; requested_role?: Role | string | null; approved_by?: string | null; approved_at?: string | null; rejected_reason?: string | null; reviewed_at?: string | null; created_at?: string; }
export interface Client { id: string; firm_id: string; assigned_employee_id?: string | null; linked_user_id?: string | null; name: string; email: string; business_name?: string | null; entity_type?: string | null; tax_id?: string | null; status: string; verified?: boolean; }
export interface Filing { id: string; firm_id: string; client_id: string; tax_type: string; period: string; due_date: string; status: FilingStatus | string; amount_owed?: number | null; amount_refund?: number | null; filed_at?: string | null; client_name?: string; }
export interface Task { id: string; firm_id: string; assigned_to?: string | null; related_client_id?: string | null; related_filing_id?: string | null; title: string; status: TaskStatus | string; priority: string; due_date?: string | null; }
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
