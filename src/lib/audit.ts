import type { createClient } from "@/lib/supabase/client";
import type { Client, DocRow } from "@/types/database";

type BrowserClient = NonNullable<ReturnType<typeof createClient>>;

/**
 * Display fallbacks for old audit rows (belt-and-braces alongside migration
 * 0031, which backfills names/actions in the database).
 */
export function humanizeAction(action: string | null | undefined): string {
  const a = (action ?? "").trim();
  if (a === "approved_user") return "approved a user";
  if (a === "rejected_user") return "rejected a user";
  if (a === "synced_signups") return "synced the signup queue";
  return a;
}

export function actorDisplayName(
  row: { actor_name?: string | null; actor_id?: string | null; entity_type?: string | null; entity_id?: string | null },
  namesById: Map<string, string>,
  docUploader: Map<string, string> = new Map()
): string {
  const direct = row.actor_name?.trim();
  if (direct) return direct;
  if (row.actor_id && namesById.get(row.actor_id)) return namesById.get(row.actor_id) as string;
  // Old upload rows carry no actor at all — resolve who uploaded via the document:
  // documents.uploaded_by (staff) else the owning client's linked login, else the company name.
  if (row.entity_type === "document" && row.entity_id && docUploader.get(row.entity_id)) {
    return docUploader.get(row.entity_id) as string;
  }
  return "Someone";
}

/**
 * documentId -> uploader display name, from live documents + clients + users.
 * Resolves old anonymous "uploaded X" audit rows without any DB migration.
 */
export function buildDocUploader(
  docs: Pick<DocRow, "id" | "uploaded_by" | "client_id">[],
  clients: Pick<Client, "id" | "linked_user_id" | "business_name" | "name">[],
  userById: Map<string, string>
): Map<string, string> {
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const out = new Map<string, string>();
  for (const d of docs) {
    const byUpload = d.uploaded_by ? userById.get(d.uploaded_by) : undefined;
    if (byUpload) {
      out.set(d.id, byUpload);
      continue;
    }
    const c = d.client_id ? clientById.get(d.client_id) : undefined;
    if (!c) continue;
    const linked = c.linked_user_id ? userById.get(c.linked_user_id) : undefined;
    out.set(d.id, linked ?? c.business_name ?? c.name);
  }
  return out;
}

/** Best-effort identity for audit rows written from the browser. */
export async function resolveActor(
  sb: BrowserClient
): Promise<{ actor_id?: string; actor_name?: string }> {
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return {};
    let name: string | undefined;
    try {
      const { data } = await sb.from("users").select("name").eq("id", user.id).maybeSingle();
      name = (data as { name?: string } | null)?.name?.trim() || undefined;
    } catch {
      /* profile read blocked — fall through to metadata */
    }
    if (!name) {
      const meta = user.user_metadata as { name?: string } | undefined;
      name = meta?.name?.trim() || user.email?.split("@")[0] || undefined;
    }
    return { actor_id: user.id, ...(name ? { actor_name: name } : {}) };
  } catch {
    return {};
  }
}
