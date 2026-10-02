"use client";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { Filing, Task, Client, Payment, ActivityItem, Jurisdiction, TaxType, JurisdictionTaxType, DocumentRequirement, ChecklistItem, DocRow } from "@/types/database";
import { resolveRequirements } from "@/lib/checklist";

async function fetchTable<T>(table: string, orderBy = "created_at"): Promise<T[]> {
  const sb = createClient();
  if (!sb) return [];
  const { data, error } = await sb.from(table).select("*").order(orderBy, { ascending: true }).limit(100);
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useFilings() { return useSWR<Filing[]>("filings", () => fetchTable<Filing>("filings", "due_date")); }
export function useTasks() { return useSWR<Task[]>("tasks", () => fetchTable<Task>("tasks", "due_date")); }
export function useClients() { return useSWR<Client[]>("clients", () => fetchTable<Client>("clients")); }
export function usePayments() { return useSWR<Payment[]>("payments", () => fetchTable<Payment>("payments", "due_date")); }
export function useActivity() { return useSWR<ActivityItem[]>("activity", () => fetchTable<ActivityItem>("activity_log", "created_at")); }
export function useDocuments() {
  return useSWR("documents", async () => {
    const sb = createClient();
    if (!sb) return [];
    const { data } = await sb.from("documents").select("*").order("created_at", { ascending: false }).limit(50);
    return data ?? [];
  });
}

// ---------- Smart Documents data layer (Phase 1B, SWR — no new deps) ----------

/** Signed-in client's own client record (via linked_user_id, then client_users). */
export function useMyClient() {
  return useSWR<Client | null>("my-client", async () => {
    const sb = createClient();
    if (!sb) return null;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data: direct } = await sb.from("clients").select("*").eq("linked_user_id", user.id).limit(1).maybeSingle();
    if (direct) return direct as Client;
    const { data: link } = await sb.from("client_users").select("client_id").eq("user_id", user.id).limit(1).maybeSingle();
    if (!link) return null;
    const { data: c } = await sb.from("clients").select("*").eq("id", (link as { client_id: string }).client_id).maybeSingle();
    return (c as Client | null) ?? null;
  });
}

export function useJurisdictions() {
  return useSWR<Jurisdiction[]>("jurisdictions", async () => {
    const sb = createClient();
    if (!sb) return [];
    const { data, error } = await sb.from("jurisdictions").select("*").eq("is_active", true).order("name").limit(300);
    if (error) throw error;
    return (data ?? []) as Jurisdiction[];
  });
}

export function useTaxTypes(jurisdictionId: string | null) {
  return useSWR<TaxType[]>(
    jurisdictionId ? ["tax-types", jurisdictionId] : "tax-types-all",
    async () => {
      const sb = createClient();
      if (!sb) return [];
      if (!jurisdictionId) {
        const { data } = await sb.from("tax_types").select("*").order("name").limit(100);
        return (data ?? []) as TaxType[];
      }
      // Only tax types that have a local mapping in this jurisdiction
      const { data: links } = await sb.from("jurisdiction_tax_types").select("tax_type_id").eq("jurisdiction_id", jurisdictionId);
      const ids = ((links ?? []) as { tax_type_id: string }[]).map((l) => l.tax_type_id);
      if (!ids.length) {
        const { data } = await sb.from("tax_types").select("*").order("name").limit(100);
        return (data ?? []) as TaxType[];
      }
      const { data } = await sb.from("tax_types").select("*").in("id", ids).order("name");
      return (data ?? []) as TaxType[];
    }
  );
}

/** Local tax name / form / frequency / verification for (country, tax type). */
export function useJurisdictionTaxType(jurisdictionId: string | null, taxTypeId: string | null) {
  return useSWR<JurisdictionTaxType | null>(
    jurisdictionId && taxTypeId ? ["jtt", jurisdictionId, taxTypeId] : null,
    async () => {
      const sb = createClient();
      if (!sb) return null;
      const { data } = await sb
        .from("jurisdiction_tax_types")
        .select("*")
        .eq("jurisdiction_id", jurisdictionId as string)
        .eq("tax_type_id", taxTypeId as string)
        .limit(1)
        .maybeSingle();
      return (data as JurisdictionTaxType | null) ?? null;
    }
  );
}

/** Server-fetched rows + client-side resolution: universal + country overrides. */
export function useRequirements(jurisdictionId: string | null, taxTypeId: string | null) {
  const swr = useSWR<DocumentRequirement[]>(
    ["requirements", jurisdictionId ?? "all", taxTypeId ?? "all"],
    async () => {
      const sb = createClient();
      if (!sb) return [];
      let q = sb.from("document_requirements").select("*").order("sort_order").limit(200);
      if (jurisdictionId) q = q.or(`jurisdiction_id.is.null,jurisdiction_id.eq.${jurisdictionId}`);
      else q = q.is("jurisdiction_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DocumentRequirement[];
    }
  );
  const resolved = resolveRequirements(swr.data ?? [], jurisdictionId, taxTypeId);
  return { ...swr, data: resolved as DocumentRequirement[] | undefined, resolved };
}

/** Checklist instance rows for one filing (with requirement details joined). */
export function useChecklist(filingId: string | null) {
  return useSWR<ChecklistItem[]>(filingId ? ["checklist", filingId] : null, async () => {
    const sb = createClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from("filing_document_checklist")
      .select("*, requirement:document_requirement_id(*)")
      .eq("filing_id", filingId as string)
      .limit(100);
    if (error) throw error;
    return (data ?? []) as unknown as ChecklistItem[];
  });
}

/** Role-aware: RLS decides what comes back; filters apply client-side. */
export function useClientDocuments(filters?: { filingId?: string; status?: string; search?: string }) {
  const swr = useSWR<DocRow[]>(["client-documents", filters?.filingId ?? "all"], async () => {
    const sb = createClient();
    if (!sb) return [];
    let q = sb.from("documents").select("*").order("created_at", { ascending: false }).limit(100);
    if (filters?.filingId) q = q.eq("filing_id", filters.filingId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DocRow[];
  });
  let rows = swr.data ?? [];
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    rows = rows.filter((d) => d.file_name.toLowerCase().includes(s));
  }
  return { ...swr, data: rows };
}

/** New + unreviewed documents across the viewer's clients (staff inbox). */
export function useStaffInbox() {
  return useSWR<DocRow[]>(["staff-inbox"], async () => {
    const sb = createClient();
    if (!sb) return [];
    const { data, error } = await sb
      .from("documents")
      .select("*")
      .eq("is_new_for_staff", true)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      // Column missing pre-0004: fall back to recent uploads
      const { data: fb } = await sb.from("documents").select("*").order("created_at", { ascending: false }).limit(50);
      return (fb ?? []) as DocRow[];
    }
    return (data ?? []) as DocRow[];
  });
}
