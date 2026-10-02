"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Card, EmptyState, Badge, Button } from "./ui";
import { createClient } from "@/lib/supabase/client";
import {
  useMyClient, useJurisdictions, useTaxTypes, useJurisdictionTaxType,
  useRequirements, useChecklist, useClientDocuments,
} from "@/lib/hooks";
import { groupRequirements, checklistProgress, suggestRequirement, isoFlag, CHECKLIST_STATUS_TONE } from "@/lib/checklist";
import { downloadFile } from "@/lib/data";
import { Upload, Download, Trash2, FolderOpen, FileCheck2, Replace } from "lucide-react";
import type { DocumentRequirement, ChecklistItem } from "@/types/database";

const LAST_COUNTRY_KEY = "taxdesk-docs-country";
const LAST_TAX_KEY = "taxdesk-docs-taxtype";
const MAX_MB = 10;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.csv,.doc,.docx,.txt";

function statusLabel(s: string): string {
  const map: Record<string, string> = { pending: "Pending", uploaded: "Uploaded", received: "Received", rejected: "Rejected", waived: "Waived" };
  return map[s] ?? s.replace(/_/g, " ");
}

export function ClientDocumentsView() {
  const { data: myClient } = useMyClient();
  const { data: jurisdictions = [], isLoading: jLoading, error: jError } = useJurisdictions();
  const [countryId, setCountryId] = useState<string | null>(null);
  const [taxTypeId, setTaxTypeId] = useState<string | null>(null);
  const [period, setPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [statusChip, setStatusChip] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [dropError, setDropError] = useState("");
  const [staged, setStaged] = useState<{ file: File; suggestId: string | null; confirmedId: string | null }[]>([]);
  const itemFileRef = useRef<Record<string, HTMLInputElement | null>>({});

  // Remember last choice
  useEffect(() => {
    try {
      const c = localStorage.getItem(LAST_COUNTRY_KEY);
      const t = localStorage.getItem(LAST_TAX_KEY);
      if (c) setCountryId(c);
      if (t) setTaxTypeId(t);
    } catch {}
  }, []);
  useEffect(() => { try { if (countryId) localStorage.setItem(LAST_COUNTRY_KEY, countryId); } catch {} }, [countryId]);
  useEffect(() => { try { if (taxTypeId) localStorage.setItem(LAST_TAX_KEY, taxTypeId); } catch {} }, [taxTypeId]);

  const { data: taxTypes = [] } = useTaxTypes(countryId);
  const { data: jtt } = useJurisdictionTaxType(countryId, taxTypeId);
  const { data: requirements = [], isLoading: rLoading, error: rError } = useRequirements(countryId, taxTypeId);
  const groups = useMemo(() => groupRequirements(requirements), [requirements]);

  // Local names for the tax-type dropdown (DB-driven, never hardcoded)
  const { data: localNames = {} } = useSWR<Record<string, string>>(
    countryId ? ["jtt-names", countryId] : null,
    async () => {
      const sb = createClient();
      if (!sb) return {};
      const { data } = await sb.from("jurisdiction_tax_types").select("tax_type_id,local_name").eq("jurisdiction_id", countryId as string);
      const m: Record<string, string> = {};
      for (const r of ((data ?? []) as { tax_type_id: string; local_name: string }[])) m[r.tax_type_id] = r.local_name;
      return m;
    }
  );

  // Existing filing for (client, country, tax, period) — checklist lives on it
  const filingKey = myClient?.id && countryId && taxTypeId && period.trim()
    ? ["my-filing", myClient.id, countryId, taxTypeId, period.trim()] : null;
  const { data: filing, mutate: mutateFiling } = useSWR(filingKey, async () => {
    const sb = createClient();
    if (!sb) return null;
    const [c, j, t, p] = filingKey!.slice(1) as string[];
    const { data } = await sb.from("filings").select("*")
      .eq("client_id", c).eq("jurisdiction_id", j).eq("tax_type_id", t).eq("period", p)
      .limit(1).maybeSingle();
    return data ?? null;
  });
  const { data: checklist = [], mutate: mutateChecklist } = useChecklist((filing as { id?: string } | null)?.id ?? null);
  const statusOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of checklist as ChecklistItem[]) {
      if (c.document_requirement_id) m.set(c.document_requirement_id, String(c.status));
    }
    return (reqId: string) => m.get(reqId) ?? null;
  }, [checklist]);
  const progress = checklistProgress(requirements, statusOf);
  const ready = Boolean(countryId && taxTypeId && period.trim());
  const verified = Boolean(jtt?.verified);

  const { data: myDocs = [], mutate: mutateDocs } = useClientDocuments({ search });
  const shownDocs = statusChip === "all" ? myDocs : myDocs.filter(() => true); // status lives on checklist; chips filter via checklist below
  void shownDocs;

  const sbConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

  async function ensureFilingAndChecklist(): Promise<{ id: string; status: string }> {
    const sb = createClient();
    if (!sb || !myClient || !countryId || !taxTypeId || !period.trim()) throw new Error("Select country, tax type and period first.");
    const existing = filing as { id: string; status: string } | null;
    if (existing) return existing;
    {
      const due = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
      const { data, error } = await sb.from("filings").insert([{
        client_id: myClient.id, firm_id: myClient.firm_id,
        jurisdiction_id: countryId, tax_type_id: taxTypeId,
        tax_type: jtt?.local_name ?? "Filing", period: period.trim(),
        due_date: due, status: "created",
      }]).select().single();
      if (error) throw error;
      const created = data as { id: string; status: string };
      // Idempotent checklist generation: universal + overrides
      const rows = requirements.map((r) => ({ filing_id: created.id, document_requirement_id: r.id, status: "pending" }));
      if (rows.length) await sb.from("filing_document_checklist").upsert(rows, { onConflict: "filing_id,document_requirement_id", ignoreDuplicates: true });
      await sb.from("filings").update({ status: "documents_requested" }).eq("id", created.id);
      await mutateFiling();
      await mutateChecklist();
      return created;
    }
  }

  async function uploadFile(file: File, requirementId: string | null) {
    setFormError("");
    if (file.size > MAX_MB * 1024 * 1024) { setFormError(`"${file.name}" exceeds ${MAX_MB}MB.`); return; }
    const sb = createClient();
    if (!sb || !myClient) { setFormError("Connect Supabase to enable uploads (demo mode is read-only)."); return; }
    setBusy(file.name);
    try {
      const f = await ensureFilingAndChecklist();
      const path = `${myClient.id}/${f.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await sb.storage.from("documents").upload(path, file);
      if (upErr) throw upErr;
      const { data: ins, error: insErr } = await sb.from("documents").insert([{
        client_id: myClient.id, firm_id: myClient.firm_id, filing_id: f.id,
        file_name: file.name, file_url: path, storage_path: path,
        shared_with_client: true,
      }]).select().single();
      if (insErr) throw insErr;
      if (requirementId) {
        const item = (checklist as ChecklistItem[]).find((c) => c.document_requirement_id === requirementId);
        try {
          if (item) await sb.rpc("link_upload_to_checklist", { p_item: item.id, p_document: ins.id });
          else {
            const { data: created } = await sb.from("filing_document_checklist").insert([{
              filing_id: f.id, document_requirement_id: requirementId, status: "uploaded", document_id: ins.id,
            }]).select().single();
            void created;
          }
        } catch {
          // Pre-0004 DBs: direct link fallback
          await sb.from("documents").update({ checklist_item_id: null }).eq("id", ins.id);
        }
      }
      await sb.from("activity_log").insert([{ firm_id: myClient.firm_id, action: `uploaded ${file.name}`, entity_type: "document", entity_id: ins.id }]).then(() => {}, () => {});
      await mutateChecklist();
      await mutateDocs();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  function stageFiles(files: FileList | null) {
    setDropError("");
    if (!files?.length) return;
    if (!ready) { setDropError("Select country, tax type and period before uploading."); return; }
    const next = [...files].slice(0, 10).map((file) => {
      if (file.size > MAX_MB * 1024 * 1024) { setDropError(`"${file.name}" exceeds ${MAX_MB}MB and was skipped.`); return null; }
      const s = suggestRequirement(file.name, requirements);
      return { file, suggestId: s?.id ?? null, confirmedId: s?.id ?? null };
    }).filter(Boolean) as { file: File; suggestId: string | null; confirmedId: string | null }[];
    setStaged((p) => [...p, ...next]);
  }

  async function uploadStaged() {
    for (const s of staged) await uploadFile(s.file, s.confirmedId);
    setStaged([]);
  }

  async function removeDoc(id: string, status?: string) {
    if (status === "received") return;
    if (!window.confirm("Delete this upload? You can only delete items that are still pending.")) return;
    const sb = createClient();
    if (!sb) return;
    await sb.from("documents").delete().eq("id", id);
    await mutateDocs();
    await mutateChecklist();
  }

  async function bulkZip() {
    const sb = createClient();
    const picked = myDocs.filter((d) => selected.includes(d.id));
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    if (sb) {
      for (const d of (picked.length ? picked : myDocs).slice(0, 25)) {
        try {
          const { data } = await sb.storage.from("documents").download(d.file_url);
          if (data) zip.file(d.file_name, data);
        } catch { zip.file(d.file_name + ".txt", `Could not fetch ${d.file_name}`); }
      }
    }
    zip.file("manifest.txt", (picked.length ? picked : myDocs).map((d) => d.file_name).join("\n") || "No files");
    const blob = await zip.generateAsync({ type: "blob" });
    downloadFile("my-documents.zip", blob);
  }

  const filteredCountries = countrySearch
    ? jurisdictions.filter((j) => `${j.name} ${j.iso_code}`.toLowerCase().includes(countrySearch.toLowerCase()))
    : jurisdictions;
  const country = jurisdictions.find((j) => j.id === countryId) ?? null;

  return (
    <div className="space-y-4">
      {/* 1. Header (kept) */}
      <div className="flex flex-wrap items-center gap-3">
        <div><h1 className="text-2xl font-bold">Documents</h1><p className="text-sm" style={{ color: "var(--text-2)" }}>Upload, share and download files</p></div>
        <div className="ml-auto flex gap-2">
          <label className={`btn-primary cursor-pointer px-4 py-2.5 text-sm ${!ready ? "opacity-50" : ""}`} title={!ready ? "Select country, tax type and period first" : "Upload docs"}>
            {busy ? "Uploading…" : "Upload docs"}
            <input type="file" className="hidden" multiple accept={ACCEPT} onChange={(e) => { stageFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <Button variant="ghost" onClick={bulkZip}><Download size={15} /> Bulk ZIP</Button>
        </div>
      </div>
      {!sbConfigured && (
        <p className="rounded-xl px-4 py-2 text-xs" style={{ background: "var(--warn-bg)", color: "var(--warn-tx)" }}>
          Demo mode (no Supabase): the form below is fully interactive, but uploads need a connected project.
        </p>
      )}

      {/* 2. Filing details */}
      <Card>
        <h2 className="mb-3 font-semibold">Filing details</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="relative text-sm font-medium">Country *
            <button type="button" onClick={() => setCountryOpen((o) => !o)}
              className="mt-1 flex w-full items-center gap-2 rounded-[10px] border px-3 py-2.5 text-left text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              {country ? <span>{isoFlag(country.iso_code)} {country.name} ({country.iso_code})</span> : <span style={{ color: "var(--text-2)" }}>Select country…</span>}
            </button>
            {countryOpen && (
              <span className="absolute z-20 mt-1 block w-full rounded-xl border p-2" style={{ borderColor: "var(--border)", background: "var(--surface-elev)" }}>
                <input autoFocus placeholder="Search countries…" value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)}
                  className="mb-2 w-full rounded-lg border px-2 py-1.5 text-sm font-normal outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
                <span className="block max-h-48 overflow-y-auto">
                  {jLoading ? <span className="block px-2 py-1 text-xs font-normal">Loading…</span>
                    : filteredCountries.length === 0 ? <span className="block px-2 py-1 text-xs font-normal">No countries configured yet.</span>
                    : filteredCountries.slice(0, 50).map((j) => (
                      <button type="button" key={j.id} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm font-normal hover:opacity-80"
                        style={j.id === countryId ? { background: "var(--accent-tint)" } : undefined}
                        onClick={() => { setCountryId(j.id); setTaxTypeId(null); setCountryOpen(false); }}>
                        {isoFlag(j.iso_code)} {j.name} <span style={{ color: "var(--text-2)" }}>{j.iso_code}</span>
                      </button>
                    ))}
                </span>
              </span>
            )}
          </label>
          <label className="text-sm font-medium">Tax type *
            <select value={taxTypeId ?? ""} onChange={(e) => setTaxTypeId(e.target.value || null)} disabled={!countryId}
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal disabled:opacity-50" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <option value="">{countryId ? "Select tax type…" : "Select a country first…"}</option>
              {taxTypes.map((t) => <option key={t.id} value={t.id}>{localNames[t.id] ?? t.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Filing period *
            <input value={period} onChange={(e) => setPeriod(e.target.value)}
              placeholder={jtt?.filing_frequency === "monthly" ? "e.g. 2026-09" : jtt?.filing_frequency === "quarterly" ? "e.g. 2026-Q3" : jtt?.filing_frequency === "annual" ? "e.g. 2026" : "e.g. 2026-Q3"}
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
          <label className="text-sm font-medium">Business / reference name
            <input defaultValue={myClient?.business_name ?? myClient?.name ?? ""} placeholder="Prefilled from your profile"
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
          <label className="text-sm font-medium">Tax ID / registration number
            <input defaultValue={myClient?.tax_id ?? ""} placeholder="e.g. as on your registration"
              pattern="[A-Za-z0-9-]{4,}" title="At least 4 letters, digits or dashes (light check only)"
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
          <label className="text-sm font-medium">Notes (optional)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything your accountant should know"
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
        </div>
        {jError && <p className="mt-2 text-xs" style={{ color: "#DC2626" }}>Could not load countries. Check your connection.</p>}
      </Card>

      {/* 3. Tax details strip */}
      {countryId && taxTypeId && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{jtt?.local_name ?? taxTypes.find((t) => t.id === taxTypeId)?.name ?? "Tax filing"}</span>
            {jtt?.local_form_code && <Badge tone="accent">Form {jtt.local_form_code}</Badge>}
            {jtt?.filing_frequency && <Badge tone="neutral">{jtt.filing_frequency.replace(/_/g, " ")}</Badge>}
            {verified ? <Badge tone="success">Verified</Badge>
              : <Badge tone="warning">Standard international checklist, not country-verified</Badge>}
            {jtt?.source_url && <a href={jtt.source_url} target="_blank" rel="noreferrer" className="ml-auto text-xs font-bold text-[#2563EB] hover:underline">Official source ↗</a>}
          </div>
        </Card>
      )}

      {/* 4. Required checklist */}
      <Card>
        <div className="mb-2 flex items-center gap-3">
          <h2 className="font-semibold">Required documents</h2>
          {progress.required > 0 && (
            <span className="ml-auto text-xs font-semibold" style={{ color: "var(--text-2)" }}>
              {progress.received} of {progress.required} required received
            </span>
          )}
        </div>
        {progress.required > 0 && (
          <div className="mb-3 h-2 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--text-2) 20%, transparent)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.round((progress.received / progress.required) * 100)}%`, background: "#2563EB" }} />
          </div>
        )}
        {rLoading ? <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-14" />)}</div>
          : rError ? <EmptyState icon={<FolderOpen size={22} />} title="Could not load the checklist. Check your connection and retry." />
          : !countryId || !taxTypeId ? <EmptyState icon={<FileCheck2 size={22} />} title="Pick a country and tax type above to fetch your required-documents checklist." />
          : requirements.length === 0 ? <EmptyState icon={<FolderOpen size={22} />} title="No requirements configured for this selection yet — your accountant will request documents directly." />
          : (
            <div className="space-y-4">
              {([["Onboarding", groups.onboarding], ["Filing documents", groups.filing]] as [string, DocumentRequirement[]][]).map(([title, rows]) => rows.length === 0 ? null : (
                <div key={title}>
                  <p className="eyebrow mb-2">{title}</p>
                  <div className="space-y-2">
                    {rows.map((r) => {
                      const st = statusOf(r.id) ?? "pending";
                      const item = (checklist as ChecklistItem[]).find((c) => c.document_requirement_id === r.id);
                      return (
                        <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)" }}>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{r.name} {r.is_mandatory === false && <Badge tone="neutral">Optional</Badge>}{r.is_mandatory !== false && <Badge tone="accent">Mandatory</Badge>}</p>
                            {r.description && <p className="text-xs" style={{ color: "var(--text-2)" }}>{r.description}</p>}
                            {st === "rejected" && item?.rejection_reason && (
                              <p className="mt-1 text-xs font-medium" style={{ color: "#DC2626" }}>Needs re-upload: {item.rejection_reason}</p>
                            )}
                          </div>
                          <Badge tone={CHECKLIST_STATUS_TONE[st] ?? "neutral"}>{statusLabel(st)}</Badge>
                          <button disabled={!ready || busy !== null} onClick={() => itemFileRef.current[r.id]?.click()}
                            className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40">
                            {st === "rejected" ? "Re-upload" : st === "pending" ? "Upload" : "Replace"}
                          </button>
                          <input ref={(el) => { itemFileRef.current[r.id] = el; }} type="file" accept={ACCEPT} className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, r.id); e.target.value = ""; }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!filing && ready && requirements.length > 0 && (
                <p className="text-xs" style={{ color: "var(--text-2)" }}>No filing for this country / tax / period yet — your checklist items will be created on first upload.</p>
              )}
            </div>
          )}
        {formError && <p className="mt-2 text-xs font-medium" style={{ color: "#DC2626" }}>{formError}</p>}
      </Card>

      {/* 5. Dropzone (gated, with suggestions) */}
      <div>
        <label className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center ${ready ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
          style={{ borderColor: "#2563EB66", background: "color-mix(in srgb, #2563EB 5%, transparent)" }}>
          <Upload size={22} color="#2563EB" />
          <span className="text-sm font-semibold">{ready ? "Drag & drop files here, or click to browse" : "Select country, tax type and period to enable uploads"}</span>
          <span className="text-xs" style={{ color: "var(--text-2)" }}>Stored in Supabase Storage · scoped by RLS · max {MAX_MB}MB per file</span>
          <input type="file" className="hidden" multiple accept={ACCEPT} disabled={!ready} onChange={(e) => { stageFiles(e.target.files); e.target.value = ""; }} />
        </label>
        {dropError && <p className="mt-2 text-xs font-medium" style={{ color: "#DC2626" }}>{dropError}</p>}
        {staged.length > 0 && (
          <Card className="mt-3">
            <p className="eyebrow mb-2">Ready to upload ({staged.length})</p>
            <div className="space-y-2">
              {staged.map((s, i) => (
                <div key={`${s.file.name}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                  <span className="font-medium">{s.file.name}</span>
                  <span className="text-xs" style={{ color: "var(--text-2)" }}>{(s.file.size / 1024).toFixed(0)} KB</span>
                  <select value={s.confirmedId ?? "__other__"} onChange={(e) => setStaged((p) => p.map((x, j) => j === i ? { ...x, confirmedId: e.target.value === "__other__" ? null : e.target.value } : x))}
                    className="ml-auto rounded-lg border px-2 py-1 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                    <option value="__other__">Other documents</option>
                    {requirements.map((r) => <option key={r.id} value={r.id}>{s.suggestId === r.id ? "★ " : ""}{r.name}</option>)}
                  </select>
                  <button className="text-xs font-bold text-[#DC2626]" onClick={() => setStaged((p) => p.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={uploadStaged} disabled={busy !== null}>{busy ? `Uploading ${busy}…` : `Upload ${staged.length} file${staged.length > 1 ? "s" : ""}`}</Button>
              <Button variant="ghost" onClick={() => setStaged([])}>Clear</Button>
            </div>
          </Card>
        )}
      </div>

      {/* 6. My documents */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">My documents</h2>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files…"
            className="ml-auto rounded-[10px] border px-3 py-1.5 text-xs outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {["all", "pending", "uploaded", "received", "rejected"].map((c) => (
            <button key={c} onClick={() => setStatusChip(c)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusChip === c ? "text-white" : ""}`}
              style={statusChip === c ? { background: "#2563EB" } : { border: "1px solid var(--border)" }}>{c}</button>
          ))}
          <Button variant="ghost" className="ml-auto px-3 py-1.5 text-xs" onClick={bulkZip}><Download size={13} /> ZIP{selected.length > 0 ? ` (${selected.length})` : ""}</Button>
        </div>
        {myDocs.length === 0 ? <EmptyState icon={<FolderOpen size={22} />} title="No documents yet — upload your first file" />
          : (
            <div className="space-y-2">
              {myDocs
                .filter((d) => {
                  if (statusChip === "all") return true;
                  const it = (checklist as ChecklistItem[]).find((c) => c.document_id === d.id);
                  return (it ? String(it.status) : "pending") === statusChip;
                })
                .map((d) => {
                  const it = (checklist as ChecklistItem[]).find((c) => c.document_id === d.id);
                  const st = it ? String(it.status) : "pending";
                  return (
                    <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                      <input type="checkbox" checked={selected.includes(d.id)} onChange={() => setSelected((p) => p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id])} aria-label={`Select ${d.file_name}`} />
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{d.file_name}</span>
                        <span className="block text-xs" style={{ color: "var(--text-2)" }}>{(d.created_at ?? "").slice(0, 10)}</span></span>
                      <Badge tone={CHECKLIST_STATUS_TONE[st] ?? "neutral"}>{statusLabel(st)}</Badge>
                      <a href={d.file_url} target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1 text-xs">Download</a>
                      <label className="btn-ghost cursor-pointer px-2 py-1 text-xs" title="Replace file">
                        <Replace size={12} className="mr-1 inline" />Replace
                        <input type="file" className="hidden" accept={ACCEPT} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, it?.document_requirement_id ?? null); e.target.value = ""; }} />
                      </label>
                      {st !== "received" && (
                        <button className="rounded-lg px-2 py-1 text-xs font-bold text-[#DC2626]" title="Delete while still pending" onClick={() => removeDoc(d.id, st)}>
                          <Trash2 size={12} className="mr-1 inline" />Delete
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
      </Card>
    </div>
  );
}
