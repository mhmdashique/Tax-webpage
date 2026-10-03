import { z } from "zod";

export const filingSchema = z.object({
  client_id: z.string().uuid().optional(),
  tax_type: z.string().min(1),
  period: z.string().min(1),
  due_date: z.string().min(1),
  status: z.enum(["created", "documents_requested", "documents_received", "in_preparation", "client_review", "filed", "completed", "overdue", "pending", "in_progress", "in_review"]).default("created"),
  amount_owed: z.coerce.number().nonnegative().default(0),
  amount_refund: z.coerce.number().nonnegative().default(0),
});

export const taskSchema = z.object({
  title: z.string().min(1).max(200),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  due_date: z.string().optional(),
  related_client_id: z.string().uuid().optional().nullable(),
  related_filing_id: z.string().uuid().optional().nullable(),
});

export const clientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  business_name: z.string().optional(),
  entity_type: z.string().optional(),
  tax_id: z.string().optional(),
  status: z.string().default("active"),
});

export const messageSchema = z.object({
  recipient_id: z.string().uuid(),
  body: z.string().min(1).max(5000),
  thread_id: z.string().uuid().optional().nullable(),
});

export const signatureSchema = z.object({
  typed_name: z.string().min(1),
  document_id: z.string().uuid().optional().nullable(),
});

export const taxRuleSchema = z.object({
  jurisdiction: z.string().min(1),
  name: z.string().min(1),
  recurrence_rule: z.string().min(1),
  auto_generate: z.boolean().default(false),
});

// --- Admin approval flow (separate layer; unrelated to email confirmation) ---
export const approvalsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
});

export const approveBodySchema = z.object({
  // For client approvals: link the new client to an accountant (employee)
  // in the same firm. Optional for employees.
  assigned_employee_id: z.string().uuid().optional(),
});

export const rejectBodySchema = z.object({
  reason: z.string().max(500).optional(),
});
