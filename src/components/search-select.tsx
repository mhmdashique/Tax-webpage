"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";

export type SearchSelectOption = {
  id: string;
  label: string;
  sublabel?: string;
  email?: string;
  badge?: string;
  disabled?: boolean;
  group?: string;
};

type SearchSelectProps = {
  label: string;
  options: SearchSelectOption[];
  value: string;
  onChange: (id: string, option?: SearchSelectOption) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  loading?: boolean;
  error?: string;
  emptyText?: string;
  clearable?: boolean;
  groupBy?: (option: SearchSelectOption) => string;
  /** Set false to opt out of single-option auto preselect. Defaults to true. */
  autoSelectSingle?: boolean;
  /** Inline validation message shown under the field (e.g. "Choose a client user"). */
  validationMessage?: string;
  /** Shown instead of the dropdown when there are zero options and not loading (e.g. no linked user + profile link). */
  noOptionsHint?: React.ReactNode;
  id?: string;
  /** Visually hide the label (kept for screen readers) — use for compact filter bars / table cells. */
  hideLabel?: boolean;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * One searchable dropdown (combobox) replacing the old
 * search-text-box + native <select> pair.
 *
 * - Single text input shows the selected label when closed, typed text while open.
 * - Filters locally (case-insensitive, label/sublabel/email, ignores extra spaces).
 * - Form state stores the id only; typed text is never saved.
 */
export function SearchSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Search…",
  required,
  disabled,
  disabledReason,
  loading,
  error,
  emptyText,
  clearable = true,
  groupBy,
  autoSelectSingle = true,
  validationMessage,
  noOptionsHint,
  id: idProp,
  hideLabel,
}: SearchSelectProps) {
  const fallbackId = useId();
  const inputId = idProp ?? `ss-${fallbackId}`;
  const listId = `${inputId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((o) => o.id === value), [options, value]);

  // Single-option auto preselect (e.g. only client user / assigned employee).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (!autoSelectSingle || loading || error || disabled) return;
    if (!value && options.length === 1 && !options[0].disabled) {
      onChange(options[0].id, options[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length, loading, error, disabled, value]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open ]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    // If the query is exactly the selected label and the user hasn't typed
    // (just opened), show everything so focus reveals the full list.
    if (selected && normalize(selected.label) === q) return options;
    return options.filter((o) => {
      const hay = normalize(`${o.label} ${o.sublabel ?? ""} ${o.email ?? ""}`);
      // Match any part; also try each query token so "  moh  ash " still matches.
      if (hay.includes(q)) return true;
      const tokens = q.split(" ").filter(Boolean);
      return tokens.length > 1 && tokens.every((t) => hay.includes(t));
    });
  }, [options, query, selected]);

  // Reset highlight whenever the visible list changes (user typed / opened).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setHighlight(0);
  }, [filtered.length, query, open]);

  const grouped = useMemo(() => {
    if (!groupBy) return [{ group: "", items: filtered }];
    const map = new Map<string, SearchSelectOption[]>();
    for (const o of filtered) {
      const g = groupBy(o) ?? "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    }
    return [...map.entries()].map(([group, items]) => ({ group, items }));
  }, [filtered, groupBy]);

  // Flat list for keyboard navigation (skips disabled).
  const flatEnabled = useMemo(() => filtered.filter((o) => !o.disabled), [filtered]);

  function openList() {
    if (disabled || loading) return;
    setQuery("");
    setHighlight(0);
    setOpen(true);
  }

  function commitSelection(opt: SearchSelectOption) {
    if (opt.disabled) return;
    onChange(opt.id, opt);
    setQuery("");
    setOpen(false);
    // Keep focus on the input so the selected name is visible + Tab moves on naturally.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function clearSelection() {
    onChange("", undefined);
    setQuery("");
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const showClear = clearable && !required && !!value && !disabled;
  const inputValue = open ? query : (selected?.label ?? "");

  return (
    <div ref={rootRef} className="relative block w-full">
      <label htmlFor={inputId} className={hideLabel ? "sr-only" : "mb-1.5 block text-sm font-semibold"}>
        {label} {required && <span className="text-[#DC2626]" aria-hidden>*</span>}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && flatEnabled[highlight] ? `${inputId}-opt-${flatEnabled[highlight].id}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={inputValue}
          placeholder={selected && !open ? selected.label : placeholder}
          onFocus={openList}
          onClick={openList}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) { openList(); return; }
              setHighlight((h) => Math.min(h + 1, Math.max(flatEnabled.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              if (open && flatEnabled[highlight]) {
                e.preventDefault();
                commitSelection(flatEnabled[highlight]);
              }
            } else if (e.key === "Escape") {
              e.preventDefault();
              setQuery("");
              setOpen(false);
            } else if (e.key === "Tab") {
              // Move on without saving typed text.
              setQuery("");
              setOpen(false);
            }
          }}
          onBlur={() => {
            // Restore previous selection on blur (typed text never saved).
            // Timeout lets an option click register first.
            setTimeout(() => {
              setQuery("");
              setOpen(false);
            }, 120);
          }}
          className="w-full rounded-xl border py-2.5 pl-3 pr-16 text-sm font-normal outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: "var(--bg)", borderColor: error || validationMessage ? "#DC2626" : "var(--border)" }}
        />
        <span className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2" style={{ color: "var(--text-2)" }}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ChevronDown size={15} />}
        </span>
        {showClear && (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onClick={clearSelection}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
            style={{ color: "var(--text-2)" }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {disabled && disabledReason && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-2)" }}>{disabledReason}</p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-[#DC2626]">{error}</p>
      )}
      {validationMessage && !error && (
        <p className="mt-1 text-xs text-[#DC2626]">{validationMessage}</p>
      )}
      <span aria-live="polite" className="sr-only">
        {open ? `${filtered.length} result${filtered.length === 1 ? "" : "s"} available` : ""}
      </span>

      {open && !disabled && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border shadow-2xl absolute left-0 right-0
            max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:max-h-[60dvh]"
          style={{ background: "var(--surface-elev, var(--surface))", borderColor: "var(--border)" }}
        >
          {/* Sticky search hint on mobile bottom sheet */}
          <div className="sticky top-0 hidden px-3 py-2 text-xs font-semibold max-sm:block" style={{ background: "inherit", color: "var(--text-2)" }}>
            {label} · tap a result
          </div>
          {loading && <p className="px-3 py-3 text-sm" style={{ color: "var(--text-2)" }}>Loading…</p>}
          {!loading && error && <p role="alert" className="px-3 py-3 text-sm text-[#DC2626]">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <div className="px-3 py-3">
              <p className="text-sm" style={{ color: "var(--text-2)" }}>
                {query.trim()
                  ? (emptyText ?? `No matches for '${query.trim()}'`)
                  : (emptyText ?? "No options available.")}
              </p>
              {noOptionsHint && <div className="mt-1 text-sm">{noOptionsHint}</div>}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && !query.trim() && !noOptionsHint && options.length === 0 && (
            <p className="px-3 pb-3 text-xs" style={{ color: "var(--text-2)" }}>Nothing to show yet.</p>
          )}
          {!loading && !error && grouped.map((g) => (
            <div key={g.group || "__all"}>
              {g.group && (
                <p className="eyebrow px-3 pb-1 pt-2">{g.group}</p>
              )}
              {g.items.map((o) => {
                const enabledIdx = flatEnabled.findIndex((f) => f.id === o.id);
                const active = enabledIdx === highlight;
                const isSelected = o.id === value;
                return (
                  <button
                    key={o.id}
                    id={`${inputId}-opt-${o.id}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={o.disabled}
                    onMouseEnter={() => { if (enabledIdx >= 0) setHighlight(enabledIdx); }}
                    // eslint-disable-next-line react-hooks/refs
                    onClick={() => commitSelection(o)}
                    title={o.label + (o.sublabel ? ` — ${o.sublabel}` : "")}
                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm max-sm:py-3 max-sm:text-base ${o.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                    style={active ? { background: "var(--accent-tint, color-mix(in srgb, var(--accent) 8%, transparent))" } : undefined}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium" title={o.label}>{o.label}</span>
                      {(o.sublabel || o.email) && (
                        <span className="block truncate text-xs" style={{ color: "var(--text-2)" }} title={o.email ?? o.sublabel}>
                          {o.email ?? o.sublabel}
                        </span>
                      )}
                    </span>
                    {o.badge && (
                      <span className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                        {o.badge}
                      </span>
                    )}
                    {isSelected && <Check size={15} className="mt-1 shrink-0 text-[var(--accent)]" aria-label="Selected" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
