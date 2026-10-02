// Pure helpers for the Smart Documents checklist (no Supabase calls here,
// so the resolution rule is unit-testable in Phase 5).
import type { DocumentRequirement } from "@/types/database";

/** universal rows (jurisdiction null) + jurisdiction rows; same `code` -> jurisdiction wins. */
export function resolveRequirements(
  rows: DocumentRequirement[],
  jurisdictionId: string | null,
  taxTypeId: string | null
): DocumentRequirement[] {
  const inScope = rows.filter((r) => {
    if (r.jurisdiction_id && r.jurisdiction_id !== jurisdictionId) return false;
    if (r.tax_type_id && taxTypeId && r.tax_type_id !== taxTypeId) return false;
    if (r.tax_type_id && !taxTypeId) return r.category === "onboarding";
    return true;
  });
  const byCode = new Map<string, DocumentRequirement>();
  for (const r of inScope) {
    const prev = byCode.get(r.code);
    if (!prev) byCode.set(r.code, r);
    else if (r.jurisdiction_id && !prev.jurisdiction_id) byCode.set(r.code, r);
  }
  return [...byCode.values()].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
  );
}

export function groupRequirements(rows: DocumentRequirement[]) {
  return {
    onboarding: rows.filter((r) => r.category === "onboarding"),
    filing: rows.filter((r) => r.category !== "onboarding"),
  };
}

/** "3 of 8 required received" — counts mandatory items with status received/waived. */
export function checklistProgress(
  requirements: DocumentRequirement[],
  statusOf: (reqId: string) => string | null | undefined
): { received: number; required: number } {
  const mandatory = requirements.filter((r) => r.is_mandatory !== false);
  const received = mandatory.filter((r) => {
    const s = statusOf(r.id);
    return s === "received" || s === "waived";
  }).length;
  return { received, required: mandatory.length };
}

// Generic filename -> requirement-code keyword matcher (no country data hardcoded;
// matches on common English document words in file names and requirement names).
const KEYWORDS: [RegExp, string[]][] = [
  [/invoice|bill/i, ["invoice"]],
  [/receipt|expense/i, ["receipt", "expense"]],
  [/bank|statement/i, ["bank"]],
  [/passport|emirates|id |identity|licen[cs]e/i, ["identity", "proof", "license"]],
  [/address|utility|tenancy|rent/i, ["address", "rent"]],
  [/salary|payslip|pay |wage/i, ["salary", "payslip", "payroll"]],
  [/contract|agreement/i, ["contract", "agreement"]],
  [/balance|pnl|profit|ledger|trial/i, ["balance", "profit", "trial", "ledger"]],
  [/deed|title|valuation/i, ["deed", "title", "valuation"]],
];

export function suggestRequirement(fileName: string, rows: DocumentRequirement[]): DocumentRequirement | null {
  for (const [re, hints] of KEYWORDS) {
    if (!re.test(fileName)) continue;
    const hit = rows.find((r) =>
      hints.some((h) => r.code.toLowerCase().includes(h) || r.name.toLowerCase().includes(h))
    );
    if (hit) return hit;
  }
  return null;
}

/** Regional-indicator flag emoji derived algorithmically from the ISO code. */
export function isoFlag(iso: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso)) return "";
  return [...iso.toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join("");
}

export const CHECKLIST_STATUS_TONE: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  pending: "neutral",
  uploaded: "accent",
  received: "success",
  rejected: "danger",
  waived: "warning",
};
