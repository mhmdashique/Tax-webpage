"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Card, EmptyState, Badge, Button, Modal } from "./ui";
import { createClient } from "@/lib/supabase/client";
import {
  useMyClient, useCurrentUser, useJurisdictions, useTaxTypes, useJurisdictionTaxType,
  useRequirements, useChecklist, useClientDocuments, useDocumentVersions,
} from "@/lib/hooks";
import { groupRequirements, checklistProgress, suggestRequirement, isoFlag, CHECKLIST_STATUS_TONE } from "@/lib/checklist";
import { downloadFile } from "@/lib/data";
import { Upload, Download, Trash2, FolderOpen, FileCheck2, Replace, ChevronDown, ChevronRight, Search, RotateCcw, Eye, Pencil, History } from "lucide-react";
import type { DocumentRequirement, ChecklistItem, Jurisdiction, TaxType, DocRow, DocumentVersion } from "@/types/database";

const LAST_COUNTRY_KEY = "taxdesk-docs-country";
const LAST_TAX_KEY = "taxdesk-docs-taxtype";
const MAX_MB = 10;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.csv,.doc,.docx,.txt";

function statusLabel(s: string): string {
  const map: Record<string, string> = { pending: "Pending", uploaded: "Uploaded", received: "Received", rejected: "Rejected", waived: "Waived" };
  return map[s] ?? s.replace(/_/g, " ");
}

function regionOf(j: Jurisdiction): string {
  const r = (j.region ?? "").trim();
  return r || "Other";
}

/* ---------- Country dropdown (region-grouped, DB-driven) ---------- */
function CountryDropdown({
  jurisdictions, isLoading, error, onRetry, value, onChange,
}: {
  jurisdictions: Jurisdiction[]; isLoading: boolean; error: unknown; onRetry: () => void;
  value: string | null; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selected = jurisdictions.find((j) => j.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jurisdictions;
    return jurisdictions.filter((j) =>
      `${j.name} ${j.iso_code} ${regionOf(j)}`.toLowerCase().includes(q)
    );
  }, [jurisdictions, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Jurisdiction[]>();
    for (const j of filtered) {
      const r = regionOf(j);
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(j);
    }
    const entries = [...map.entries()].map(([region, rows]) => ({
      region,
      rows: [...rows].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    entries.sort((a, b) => {
      if (a.region === "Other") return 1;
      if (b.region === "Other") return -1;
      return a.region.localeCompare(b.region);
    });
    return entries;
  }, [filtered]);

  const selectedRegion = useMemo(() => {
    if (!value) return null;
    const j = jurisdictions.find((jj) => jj.id === value);
    return j ? regionOf(j) : null;
  }, [jurisdictions, value]);

  // Derived open-state: searching auto-expands all matching regions;
  // otherwise a region is open if explicitly toggled, or if it holds the
  // current selection and was never explicitly collapsed.
  function isRegionOpen(region: string, searching: boolean): boolean {
    if (searching) return true;
    if (expanded[region] !== undefined) return expanded[region];
    return selectedRegion === region;
  }

  // Outside-click + Escape to close; autofocus search on open.
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const visible: { region: string; j: Jurisdiction }[] = useMemo(() => {
    const out: { region: string; j: Jurisdiction }[] = [];
    const searching = Boolean(search.trim());
    for (const g of grouped) {
      const isOpen = searching ? true : (expanded[g.region] ?? (selectedRegion === g.region));
      if (!isOpen) continue;
      for (const j of g.rows) out.push({ region: g.region, j });
    }
    return out;
  }, [grouped, expanded, search, selectedRegion]);

  function toggleRegion(region: string) {
    const searching = Boolean(search.trim());
    // While searching everything is expanded; an explicit toggle pins the choice.
    if (searching) setExpanded((p) => ({ ...p, [region]: false }));
    else setExpanded((p) => ({ ...p, [region]: !(p[region] ?? (selectedRegion === region)) }));
  }

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!visible.length) return;
      setActiveIdx((i) => {
        const d = e.key === "ArrowDown" ? 1 : -1;
        return (i + d + visible.length) % visible.length;
      });
    } else if (e.key === "Enter") {
      const cur = visible[activeIdx];
      if (cur) {
        e.preventDefault();
        pick(cur.j.id);
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}
        className="mt-1 flex w-full items-center gap-2 rounded-[10px] border px-3 py-2.5 text-left text-sm font-normal"
        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
          {selected
            ? <span className="truncate">{isoFlag(selected.iso_code)} {selected.name}</span>
            : <span style={{ color: "var(--text-2)" }}>Select Country</span>}
        </span>
        <ChevronDown size={15} style={{ color: "var(--text-2)" }} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Country selection"
          onKeyDown={onPanelKeyDown}
          className="absolute z-30 mt-1 block w-full rounded-xl border p-2 shadow-xl"
          style={{ borderColor: "var(--border)", background: "var(--surface-elev)" }}
        >
          <div className="relative mb-2">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-2)" }} />
            <input
              ref={searchRef}
              placeholder="Search countries…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setActiveIdx(0); }}
              className="w-full rounded-lg border py-1.5 pl-8 pr-2 text-sm font-normal outline-none"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {isLoading ? (
              <span className="block px-2 py-4 text-center text-xs font-normal" style={{ color: "var(--text-2)" }}>Loading countries…</span>
            ) : error ? (
              <span className="block px-2 py-2 text-xs font-normal">
                <span className="mb-2 block" style={{ color: "#DC2626" }}>Could not load countries. Check your connection.</span>
                <button type="button" onClick={onRetry} className="btn-ghost inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold">
                  <RotateCcw size={12} /> Retry
                </button>
              </span>
            ) : grouped.length === 0 ? (
              <span className="block px-2 py-4 text-center text-xs font-normal" style={{ color: "var(--text-2)" }}>
                {search ? `No countries match "${search}".` : "No countries configured yet."}
              </span>
            ) : (
              grouped.map((g) => {
                const searching = Boolean(search.trim());
                const isOpen = isRegionOpen(g.region, searching);
                return (
                  <div key={g.region} className="mb-1">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggleRegion(g.region)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRegion(g.region); } }}
                      className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide hover:opacity-80"
                      style={{ color: "var(--text-2)" }}
                    >
                      <ChevronRight size={13} className={isOpen ? "rotate-90 transition-transform" : "transition-transform"} />
                      <span className="flex-1 truncate">{g.region}</span>
                      <span className="rounded-full px-1.5 text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--text-2) 15%, transparent)" }}>{g.rows.length}</span>
                    </button>
                    {isOpen && (
                      <div>
                        {g.rows.map((j) => {
                          const flatIdx = visible.findIndex((v) => v.j.id === j.id);
                          const isActive = flatIdx === activeIdx;
                          const isSel = j.id === value;
                          return (
                            <button
                              type="button"
                              key={j.id}
                              role="option"
                              aria-selected={isSel}
                              onMouseEnter={() => flatIdx >= 0 && setActiveIdx(flatIdx)}
                              onClick={() => pick(j.id)}
                              className="block w-full rounded-lg px-2 py-1.5 pl-7 text-left text-sm font-normal hover:opacity-80"
                              style={isSel ? { background: "var(--accent-tint)", fontWeight: 600 }
                                : isActive ? { background: "color-mix(in srgb, var(--text-2) 12%, transparent)" } : undefined}
                            >
                              {isoFlag(j.iso_code)} {j.name}{" "}
                              <span style={{ color: "var(--text-2)" }}>{j.iso_code}</span>
                              {isSel && <span className="ml-1 text-xs">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Tax-type dropdown (dependent on country, DB-driven) ---------- */
function TaxTypeDropdown({
  countryId, taxTypes, localNames, isLoading, error, onRetry, value, onChange,
}: {
  countryId: string | null; taxTypes: TaxType[]; localNames: Record<string, string>;
  isLoading: boolean; error: unknown; onRetry: () => void;
  value: string | null; onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const disabled = !countryId;

  const selected = taxTypes.find((t) => t.id === value) ?? null;
  const labelOf = (t: TaxType) => localNames[t.id] ?? t.name;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!taxTypes.length) return;
      setActiveIdx((i) => {
        const d = e.key === "ArrowDown" ? 1 : -1;
        return (i + d + taxTypes.length) % taxTypes.length;
      });
    } else if (e.key === "Enter") {
      const cur = taxTypes[activeIdx];
      if (cur) { e.preventDefault(); pick(cur.id); }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open && !disabled) { e.preventDefault(); setOpen(true); } }}
        className="mt-1 flex w-full items-center gap-2 rounded-[10px] border px-3 py-2.5 text-left text-sm font-normal disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: "var(--border)", background: "var(--bg)" }}
        title={disabled ? "Select a country first" : "Select tax type"}
      >
        <span className="flex min-w-0 flex-1 truncate">
          {disabled
            ? <span style={{ color: "var(--text-2)" }}>Select a country first</span>
            : selected
              ? <span className="truncate font-medium">{labelOf(selected)}</span>
              : isLoading
                ? <span style={{ color: "var(--text-2)" }}>Loading tax types…</span>
                : <span style={{ color: "var(--text-2)" }}>Select Tax Type</span>}
        </span>
        <ChevronDown size={15} style={{ color: "var(--text-2)" }} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {open && !disabled && (
        <div
          role="listbox"
          aria-label="Tax type selection"
          onKeyDown={onPanelKeyDown}
          className="absolute z-30 mt-1 block w-full rounded-xl border p-2 shadow-xl"
          style={{ borderColor: "var(--border)", background: "var(--surface-elev)" }}
        >
          <div className="max-h-56 overflow-y-auto">
            {isLoading ? (
              <span className="block px-2 py-4 text-center text-xs font-normal" style={{ color: "var(--text-2)" }}>Loading tax types…</span>
            ) : error ? (
              <span className="block px-2 py-2 text-xs font-normal">
                <span className="mb-2 block" style={{ color: "#DC2626" }}>Could not load tax types. Check your connection.</span>
                <button type="button" onClick={onRetry} className="btn-ghost inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold">
                  <RotateCcw size={12} /> Retry
                </button>
              </span>
            ) : taxTypes.length === 0 ? (
              <span className="block px-2 py-4 text-center text-xs font-normal" style={{ color: "var(--text-2)" }}>
                No tax types available for this country yet.
              </span>
            ) : (
              taxTypes.map((t, i) => {
                const isSel = t.id === value;
                const isActive = i === activeIdx;
                return (
                  <button
                    type="button"
                    key={t.id}
                    role="option"
                    aria-selected={isSel}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => pick(t.id)}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm font-normal hover:opacity-80"
                    style={isSel ? { background: "var(--accent-tint)", fontWeight: 600 }
                      : isActive ? { background: "color-mix(in srgb, var(--text-2) 12%, transparent)" } : undefined}
                  >
                    {labelOf(t)}
                    {isSel && <span className="ml-1 text-xs">✓</span>}
                  </button>
                );
              })
            )}
          </div>
          {taxTypes.length > 1 && !isLoading && !error && (
            <p className="mt-1 px-2 text-[11px]" style={{ color: "var(--text-2)" }}>{taxTypes.length} options for this country</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Document version helpers (Phase 2, additive only) ---------- */

/** Storage object path for a document row (new convention; legacy rows may
 *  only carry a public URL in file_url). */
function storagePathOf(d: Pick<DocRow, "storage_path" | "file_url">): string | null {
  if (d.storage_path) return d.storage_path;
  // Legacy flat-path uploads stored the public URL — not resolvable to an
  // object path, so versioned download falls back to the URL itself.
  if (d.file_url && !/^https?:\/\//.test(d.file_url)) return d.file_url;
  return null;
}

/** A document is locked for direct replacement once staff accepted it
 *  (checklist received) or the filing moved to filed/completed. */
function lockReason(
  checklistStatus: string | null,
  filingStatus?: string | null
): string | null {
  if (checklistStatus === "received")
    return "This document has been accepted by your accountant. To replace it, please ask them to reopen it first.";
  const f = (filingStatus ?? "").toLowerCase();
  if (f === "filed" || f === "completed")
    return "This filing has already been filed. To replace a document, please ask your accountant to reopen it first.";
  return null;
}

/** Per-document version history (current + previous versions, all downloadable). */
function VersionHistory({ documentId, currentVersionNo }: { documentId: string; currentVersionNo: number }) {
  const { data: versions, isLoading } = useDocumentVersions(documentId);

  async function downloadVersion(v: DocumentVersion) {
    const sb = createClient();
    const path = v.storage_path ?? (!/^https?:\/\//.test(v.file_url) ? v.file_url : null);
    if (sb && path) {
      try {
        await sb.rpc("log_document_download", { p_document: documentId }).then(() => {}, () => {});
        const { data, error } = await sb.storage.from("documents").download(path);
        if (!error && data) {
          const url = URL.createObjectURL(data);
          const a = document.createElement("a");
          a.href = url;
          a.download = v.file_name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          return;
        }
      } catch { /* fall through to URL open */ }
    }
    window.open(v.file_url, "_blank", "noopener");
  }

  if (isLoading)
    return <p className="px-1 py-2 text-xs" style={{ color: "var(--text-2)" }}>Loading version history…</p>;
  if (!versions || versions.length === 0)
    return (
      <p className="px-1 py-2 text-xs" style={{ color: "var(--text-2)" }}>
        v{currentVersionNo} · current version only — full history appears after the next re-upload (or once migration 0007 is applied).
      </p>
    );
  return (
    <div className="space-y-1.5 px-1 py-1">
      {versions.map((v) => {
        const isCurrent = v.version_no === currentVersionNo;
        return (
          <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-xs" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
            <Badge tone={isCurrent ? "success" : "neutral"}>v{v.version_no}{isCurrent ? " · current" : ""}</Badge>
            <span className="min-w-0 flex-1 truncate font-medium">{v.file_name}</span>
            <span style={{ color: "var(--text-2)" }}>{(v.created_at ?? "").slice(0, 10)}</span>
            <button onClick={() => downloadVersion(v)} className="font-bold text-[#2563EB] hover:underline">Download</button>
          </div>
        );
      })}
    </div>
  );
}

export function ClientDocumentsView() {
  const { data: myClient } = useMyClient();
  const { data: currentUser } = useCurrentUser();
  const { data: jurisdictions = [], isLoading: jLoading, error: jError, mutate: mutateJurisdictions } = useJurisdictions();
  const [countryId, setCountryId] = useState<string | null>(null);
  const [taxTypeId, setTaxTypeId] = useState<string | null>(null);
  const [period, setPeriod] = useState("");
  const [notes, setNotes] = useState("");
  const [statusChip, setStatusChip] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [dropError, setDropError] = useState("");
  const [staged, setStaged] = useState<{ file: File; suggestId: string | null; confirmedId: string | null }[]>([]);
  const itemFileRef = useRef<Record<string, HTMLInputElement | null>>({});
  // Phase 2: per-document replace / edit / history state
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [replaceProgress, setReplaceProgress] = useState<string>("");
  const [replaceErrors, setReplaceErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState("");
  const [editingDoc, setEditingDoc] = useState<DocRow | null>(null);
  const [editForm, setEditForm] = useState({ file_name: "", period: "", notes: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [viewingId, setViewingId] = useState<string | null>(null);
  const replaceFileRef = useRef<HTMLInputElement | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<DocRow | null>(null);
  const [retryable, setRetryable] = useState<Record<string, boolean>>({});
  const failedReplace = useRef<Record<string, { file: File; requirementId: string | null }>>({});

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

  const { data: taxTypes = [], isLoading: tLoading, error: tError, mutate: mutateTaxTypes } = useTaxTypes(countryId);
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

  // If a country has exactly one tax type, surface it as the selection.
  useEffect(() => {
    if (countryId && !tLoading && !tError && taxTypes.length === 1 && taxTypes[0].id !== taxTypeId) {
      setTaxTypeId(taxTypes[0].id);
    }
  }, [countryId, tLoading, tError, taxTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleCountryChange(id: string) {
    setCountryId(id);
    setTaxTypeId(null); // reset previous tax selection on country change
  }

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
    if (!sb) { setFormError("Connect Supabase to enable uploads (demo mode is read-only)."); return; }
    if (!myClient) {
      // Say exactly what's wrong instead of a generic role error: most often a
      // client login whose company record was never linked to it.
      const who = currentUser as { name?: string; role?: string } | null;
      const role = who?.role ?? "";
      const name = who?.name ?? "this login";
      if (role === "admin" || role === "employee") {
        setFormError(`You're logged in as ${name} (${role}) — uploads need a Client login. Log out and sign in with the client account.`);
      } else {
        setFormError(`No company record is linked to ${name}. Ask your admin to link it (Admin → Team → “Sync signups” repairs this automatically), then refresh this page.`);
      }
      return;
    }
    setBusy(file.name);
    try {
      const f = await ensureFilingAndChecklist();
      const path = `${myClient.id}/${f.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await sb.storage.from("documents").upload(path, file);
      if (upErr) throw upErr;
      const { data: ins, error: insErr } = await sb.from("documents").insert([{
        client_id: myClient.id, firm_id: myClient.firm_id, filing_id: f.id,
        file_name: file.name, file_url: path, storage_path: path,
        shared_with_client: true, version_no: 1,
      }]).select().single();
      if (insErr) {
        // Storage object is orphaned without its row — remove it where safe.
        await sb.storage.from("documents").remove([path]).then(() => {}, () => {});
        throw insErr;
      }
      // v1 snapshot (best-effort: skipped on pre-0007 DBs).
      await sb.from("document_versions").insert([{
        document_id: (ins as { id: string }).id, version_no: 1,
        file_name: file.name, file_url: path, storage_path: path,
      }]).then(() => {}, () => {});
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

  /* ---------- Phase 2: view / edit / replace (versioned, non-destructive) ---------- */

  function statusOfDoc(d: DocRow): string {
    const it = (checklist as ChecklistItem[]).find((c) => c.document_id === d.id);
    return it ? String(it.status) : "pending";
  }

  async function viewDocument(d: DocRow) {
    if (d.client_id !== myClient?.id) return;
    setViewingId(d.id);
    try {
      const sb = createClient();
      const path = storagePathOf(d);
      if (sb && path) {
        await sb.rpc("log_document_download", { p_document: d.id }).then(() => {}, () => {});
        const { data, error } = await sb.storage.from("documents").download(path);
        if (!error && data) {
          const url = URL.createObjectURL(data);
          window.open(url, "_blank", "noopener");
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          return;
        }
      }
      window.open(d.file_url, "_blank", "noopener");
    } finally {
      setViewingId(null);
    }
  }

  function openEdit(d: DocRow) {
    if (d.client_id !== myClient?.id) return;
    const f = (filing && (filing as { id?: string }).id && d.filing_id === (filing as { id: string }).id)
      ? (filing as { period?: string })
      : null;
    setEditingDoc(d);
    setEditForm({
      file_name: d.file_name ?? "",
      period: (f?.period as string) ?? period,
      notes: (d.notes as string) ?? "",
    });
  }

  async function saveEdit() {
    if (!editingDoc || editingDoc.client_id !== myClient?.id) return;
    const name = editForm.file_name.trim();
    if (!name) { setFormError("Document name cannot be empty."); return; }
    const sb = createClient();
    if (!sb) { setFormError("Connect Supabase to enable editing (demo mode is read-only)."); return; }
    setSavingEdit(true);
    setFormError("");
    try {
      const { error: docErr } = await sb.from("documents")
        .update({ file_name: name, notes: editForm.notes || null })
        .eq("id", editingDoc.id);
      if (docErr) throw docErr;
      if (editingDoc.filing_id && editForm.period.trim()) {
        const { error: filErr } = await sb.from("filings")
          .update({ period: editForm.period.trim() })
          .eq("id", editingDoc.filing_id);
        if (filErr) throw filErr;
      }
      setEditingDoc(null);
      setSuccessMsg("✓ Details saved.");
      setTimeout(() => setSuccessMsg(""), 4000);
      await mutateDocs();
      await mutateFiling();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save details.");
    } finally {
      setSavingEdit(false);
    }
  }

  /** Replace the file behind a logical document: new Storage object + new
   *  version row, documents pointer moves forward, history preserved. */
  async function replaceDocument(d: DocRow, file: File, requirementId: string | null) {
    if (d.client_id !== myClient?.id) return;
    const st = statusOfDoc(d);
    const filingStatus = d.filing_id && filing && (filing as { id?: string }).id === d.filing_id
      ? (filing as { status?: string }).status ?? null
      : null;
    const locked = lockReason(st, filingStatus);
    if (locked) {
      setReplaceErrors((p) => ({ ...p, [d.id]: locked }));
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setReplaceErrors((p) => ({ ...p, [d.id]: `"${file.name}" exceeds ${MAX_MB}MB.` }));
      return;
    }
    const sb = createClient();
    if (!sb || !myClient) {
      setReplaceErrors((p) => ({ ...p, [d.id]: "Connect Supabase to enable re-upload (demo mode is read-only)." }));
      return;
    }
    setReplacingId(d.id);
    setReplaceProgress(file.name);
    setReplaceErrors((p) => { const n = { ...p }; delete n[d.id]; return n; });
    setSuccessMsg("");
    // Keep the file for Retry until this attempt succeeds.
    failedReplace.current[d.id] = { file, requirementId };
    setRetryable((p) => ({ ...p, [d.id]: true }));
    const folder = d.filing_id ?? "unfiled";
    const path = `${myClient.id}/${folder}/${Date.now()}-${file.name}`;
    try {
      const { error: upErr } = await sb.storage.from("documents").upload(path, file);
      if (upErr) throw upErr;
      try {
        // Next version number (falls back to pointer+1 when history is absent).
        let next = (d.version_no ?? 1) + 1;
        const { data: existing } = await sb.from("document_versions")
          .select("version_no").eq("document_id", d.id)
          .order("version_no", { ascending: false }).limit(1).maybeSingle();
        if (existing && typeof (existing as { version_no: number }).version_no === "number") {
          next = (existing as { version_no: number }).version_no + 1;
        }
        const { error: verErr } = await sb.from("document_versions").insert([{
          document_id: d.id, version_no: next,
          file_name: file.name, file_url: path, storage_path: path,
        }]);
        if (verErr) throw verErr;
        const { error: ptrErr } = await sb.from("documents").update({
          file_name: file.name, file_url: path, storage_path: path, version_no: next,
        }).eq("id", d.id);
        if (ptrErr) throw ptrErr;
        // Re-enter review as a fresh upload (clears prior rejection).
        const item = (checklist as ChecklistItem[]).find((c) => c.document_id === d.id);
        if (item) {
          try {
            await sb.rpc("link_upload_to_checklist", { p_item: item.id, p_document: d.id });
          } catch { /* pre-0004 DBs: pointer update above is enough */ }
        } else if (requirementId && d.filing_id) {
          await sb.from("filing_document_checklist").upsert([{
            filing_id: d.filing_id, document_requirement_id: requirementId,
            status: "uploaded", document_id: d.id,
          }], { onConflict: "filing_id,document_requirement_id" }).then(() => {}, () => {});
        }
        await sb.from("activity_log").insert([{
          firm_id: myClient.firm_id, action: `re-uploaded ${file.name} (v${next})`,
          entity_type: "document", entity_id: d.id,
        }]).then(() => {}, () => {});
        delete failedReplace.current[d.id];
        setRetryable((p) => { const n = { ...p }; delete n[d.id]; return n; });
        setSuccessMsg(`✓ ${file.name} uploaded as v${next}.`);
        setTimeout(() => setSuccessMsg(""), 5000);
        await mutateDocs();
        await mutateChecklist();
      } catch (dbErr) {
        // DB insert failed after the bytes landed — remove the orphan object
        // where safe, keep the previous current version untouched.
        // (failedReplace entry is kept so Retry can re-attempt the same file.)
        await sb.storage.from("documents").remove([path]).then(() => {}, () => {});
        throw dbErr;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Re-upload failed.";
      // A file is always staged for Retry at this point (saved before upload).
      setReplaceErrors((p) => ({ ...p, [d.id]: `${msg} Tap Retry to try again.` }));
    } finally {
      setReplacingId(null);
      setReplaceProgress("");
    }
  }

  async function retryReplace(d: DocRow) {
    const saved = failedReplace.current[d.id];
    if (!saved) return;
    await replaceDocument(d, saved.file, saved.requirementId);
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

  const country = jurisdictions.find((j) => j.id === countryId) ?? null;
  const selectedTaxLabel = taxTypeId
    ? (localNames[taxTypeId] ?? taxTypes.find((t) => t.id === taxTypeId)?.name ?? "")
    : "";

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
        <div className="grid gap-3 overflow-visible md:grid-cols-3">
          <div className="text-sm font-medium">Country *
            <CountryDropdown
              jurisdictions={jurisdictions}
              isLoading={jLoading}
              error={jError}
              onRetry={() => mutateJurisdictions()}
              value={countryId}
              onChange={handleCountryChange}
            />
          </div>
          <div className="text-sm font-medium">Tax type *
            <TaxTypeDropdown
              key={countryId ?? "no-country"}
              countryId={countryId}
              taxTypes={taxTypes}
              localNames={localNames}
              isLoading={tLoading}
              error={tError}
              onRetry={() => mutateTaxTypes()}
              value={taxTypeId}
              onChange={(id) => setTaxTypeId(id)}
            />
            {countryId && !tLoading && !tError && taxTypes.length === 0 && (
              <p className="mt-1 text-[11px] font-normal" style={{ color: "var(--text-2)" }}>No tax types configured for this country yet.</p>
            )}
          </div>
          <label className="text-sm font-medium">Filing period *
            <input value={period} onChange={(e) => setPeriod(e.target.value)}
              placeholder={jtt?.filing_frequency === "monthly" ? "e.g. 2026-09" : jtt?.filing_frequency === "quarterly" ? "e.g. 2026-Q3" : jtt?.filing_frequency === "annual" ? "e.g. 2026" : "e.g. 2026-Q3"}
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
          <label className="text-sm font-medium">Business / reference name
            <input defaultValue={myClient?.business_name ?? myClient?.name ?? ""} placeholder="Prefilled from your profile"
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
          <label className="text-sm font-medium">Tax ID / registration number{country || selectedTaxLabel ? ` — ${country ? country.name : ""}${country && selectedTaxLabel ? " · " : ""}${selectedTaxLabel}` : ""}
            <input defaultValue={myClient?.tax_id ?? ""} key={`${countryId ?? "no-country"}-${taxTypeId ?? "no-tax"}`}
              placeholder={country ? `e.g. ${country.name} registration number` : "e.g. as on your registration"}
              pattern="[A-Za-z0-9-]{4,}" title={country && taxTypeId ? `Tax ID for ${country.name}${selectedTaxLabel ? ` (${selectedTaxLabel})` : ""}: at least 4 letters, digits or dashes` : "At least 4 letters, digits or dashes (light check only)"}
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
          <label className="text-sm font-medium">Notes (optional)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything your accountant should know"
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
        </div>
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

      {/* 5. Dropzone area (Drag & drop visual removed by request, staging UI kept for the top upload button) */}
      <div>
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
        {successMsg && (
          <p className="rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}>{successMsg}</p>
        )}
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
                  const filingStatus = d.filing_id && filing && (filing as { id?: string }).id === d.filing_id
                    ? (filing as { status?: string }).status ?? null
                    : null;
                  const locked = lockReason(st, filingStatus);
                  const vNo = d.version_no ?? 1;
                  const isReplacing = replacingId === d.id;
                  const docError = replaceErrors[d.id];
                  const histOpen = historyOpen[d.id] ?? false;
                  return (
                    <div key={d.id} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <input type="checkbox" checked={selected.includes(d.id)} onChange={() => setSelected((p) => p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id])} aria-label={`Select ${d.file_name}`} />
                        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{d.file_name}</span>
                          <span className="block text-xs" style={{ color: "var(--text-2)" }}>
                            v{vNo} · {(d.created_at ?? "").slice(0, 10)}{vNo > 1 ? " · Re-uploaded" : ""}
                          </span></span>
                        <Badge tone={CHECKLIST_STATUS_TONE[st] ?? "neutral"}>{statusLabel(st)}</Badge>
                        {vNo > 1 && <Badge tone="accent">Re-uploaded</Badge>}
                        <button onClick={() => viewDocument(d)} disabled={viewingId === d.id}
                          className="btn-ghost px-2 py-1 text-xs disabled:opacity-50" title="View latest document">
                          <Eye size={12} className="mr-1 inline" />{viewingId === d.id ? "Opening…" : "View"}
                        </button>
                        <button onClick={() => openEdit(d)} className="btn-ghost px-2 py-1 text-xs" title="Edit name, period and notes">
                          <Pencil size={12} className="mr-1 inline" />Edit
                        </button>
                        {locked ? (
                          <button className="btn-ghost cursor-not-allowed px-2 py-1 text-xs opacity-50"
                            title={locked} onClick={() => setReplaceErrors((p) => ({ ...p, [d.id]: locked }))}>
                            <Replace size={12} className="mr-1 inline" />Replace
                          </button>
                        ) : (
                          <button className="btn-ghost px-2 py-1 text-xs" title="Replace with a new file (keeps history)"
                            disabled={isReplacing}
                            onClick={() => { setReplaceTarget(d); replaceFileRef.current?.click(); }}>
                            <Replace size={12} className="mr-1 inline" />{isReplacing ? `Uploading ${replaceProgress}…` : "Replace"}
                          </button>
                        )}
                        <button onClick={() => setHistoryOpen((p) => ({ ...p, [d.id]: !histOpen }))}
                          className="btn-ghost px-2 py-1 text-xs" title="View version history" aria-expanded={histOpen}>
                          <History size={12} className="mr-1 inline" />History
                        </button>
                        {st !== "received" && !locked && (
                          <button className="rounded-lg px-2 py-1 text-xs font-bold text-[#DC2626]" title="Delete while still pending" onClick={() => removeDoc(d.id, st)}>
                            <Trash2 size={12} className="mr-1 inline" />Delete
                          </button>
                        )}
                      </div>
                      {isReplacing && (
                        <p className="mt-1.5 text-xs font-medium" style={{ color: "var(--text-2)" }}>
                          <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-t-transparent align-middle" style={{ borderColor: "var(--text-2)" }} />
                          Uploading {replaceProgress}…
                        </p>
                      )}
                      {docError && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-medium" style={{ color: "#DC2626" }}>
                          <span>✕ {docError}</span>
                          {retryable[d.id] && (
                            <button onClick={() => retryReplace(d)} className="btn-ghost inline-flex items-center gap-1 px-2 py-1 text-xs font-bold">
                              <RotateCcw size={11} /> Retry
                            </button>
                          )}
                        </p>
                      )}
                      {histOpen && (
                        <div className="mt-2 border-t pt-1" style={{ borderColor: "var(--border)" }}>
                          <VersionHistory documentId={d.id} currentVersionNo={vNo} />
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
      </Card>
      {/* Hidden file picker shared by all Replace buttons */}
      <input ref={replaceFileRef} type="file" accept={ACCEPT} className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const target = replaceTarget;
          e.target.value = "";
          setReplaceTarget(null);
          if (f && target) {
            const item = (checklist as ChecklistItem[]).find((c) => c.document_id === target.id);
            replaceDocument(target, f, item?.document_requirement_id ?? null);
          }
        }} />
      {/* Edit Details modal */}
      <Modal open={editingDoc !== null} onClose={() => setEditingDoc(null)} title="Edit document details">
        <div className="space-y-3">
          <label className="block text-sm font-medium">Document name *
            <input value={editForm.file_name} onChange={(e) => setEditForm({ ...editForm, file_name: e.target.value })}
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
          <label className="block text-sm font-medium">Filing period
            <input value={editForm.period} onChange={(e) => setEditForm({ ...editForm, period: e.target.value })} placeholder="e.g. 2026-Q3"
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
          <label className="block text-sm font-medium">Notes (optional)
            <input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Anything your accountant should know"
              className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm font-normal" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={savingEdit} onClick={saveEdit}>{savingEdit ? "Saving…" : "Save changes"}</Button>
            <Button variant="ghost" onClick={() => setEditingDoc(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
