"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Monitor, Moon, Sun, Check } from "lucide-react";

export type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const Ctx = createContext<{
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  accent: Accent;
  setAccent: (a: Accent) => void;
}>({ theme: "system", resolved: "light", setTheme: () => {}, toggle: () => {}, accent: "blue", setAccent: () => {} });

export type Accent = "blue" | "green" | "yellow";

const ACCENTS: Record<Accent, { accent: string; hover: string; tint: string; tintDark: string }> = {
  blue: { accent: "#2563EB", hover: "#1D4ED8", tint: "#DBEAFE", tintDark: "rgba(96,165,250,0.14)" },
  green: { accent: "#16A34A", hover: "#15803D", tint: "#DCFCE7", tintDark: "rgba(34,197,94,0.14)" },
  yellow: { accent: "#D97706", hover: "#B45309", tint: "#FEF3C7", tintDark: "rgba(251,191,36,0.16)" },
};

function readAccent(): Accent {
  if (typeof document === "undefined") return "blue";
  const c = document.cookie.match(/(?:^|; )taxdesk-accent=(blue|green|yellow)/)?.[1];
  if (c === "blue" || c === "green" || c === "yellow") return c;
  try {
    const ls = localStorage.getItem("taxdesk-accent");
    if (ls === "blue" || ls === "green" || ls === "yellow") return ls;
  } catch {}
  return "blue";
}

function applyAccent(a: Accent, dark: boolean) {
  if (typeof document === "undefined") return;
  const p = ACCENTS[a] ?? ACCENTS.blue;
  const root = document.documentElement;
  root.dataset.accent = a;
  root.style.setProperty("--accent", p.accent);
  root.style.setProperty("--accent-hover", p.hover);
  root.style.setProperty("--accent-tint", dark ? p.tintDark : p.tint);
}

function readStored(): Theme {
  if (typeof document === "undefined") return "system";
  const c = document.cookie.match(/(?:^|; )taxdesk-theme=(light|dark|system)/)?.[1];
  if (c === "light" || c === "dark" || c === "system") return c;
  try {
    const ls = localStorage.getItem("taxdesk-theme");
    if (ls === "light" || ls === "dark" || ls === "system") return ls as Theme;
  } catch {}
  return "system";
}

function systemIsDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyResolved(resolved: Resolved) {
  const root = document.documentElement;
  root.classList.add("theme-anim");
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  const t = setTimeout(() => root.classList.remove("theme-anim"), 350);
  return () => clearTimeout(t);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy init reads persisted choice / device setting without a post-mount
  // setState (avoids the cascading-render lint + a first-paint theme flash).
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof document === "undefined" ? "system" : readStored()
  );
  const [sysDark, setSysDark] = useState(
    () => typeof window !== "undefined" && systemIsDark()
  );

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  const resolved: Resolved = theme === "system" ? (sysDark ? "dark" : "light") : theme;

  const [accent, setAccentState] = useState<Accent>(() =>
    typeof document === "undefined" ? "blue" : readAccent()
  );

  useEffect(() => {
    const cleanup = applyResolved(resolved);
    document.cookie = `taxdesk-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
    try {
      localStorage.setItem("taxdesk-theme", theme);
    } catch {}
    return cleanup;
  }, [theme, resolved]);

  useEffect(() => {
    applyAccent(accent, resolved === "dark");
    document.cookie = `taxdesk-accent=${accent}; path=/; max-age=31536000; samesite=lax`;
    try {
      localStorage.setItem("taxdesk-accent", accent);
    } catch {}
  }, [accent, resolved]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((t) => ((t === "system" ? systemIsDark() : t === "dark") ? "light" : "dark")),
    []
  );
  const setAccent = useCallback((a: Accent) => setAccentState(a), []);

  const value = useMemo(() => ({ theme, resolved, setTheme, toggle, accent, setAccent }), [theme, resolved, setTheme, toggle, accent, setAccent]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

/* ------------------------------------------------------------------ */
/*  New UI: appearance picker for the Preferences / night-mode section */
/* ------------------------------------------------------------------ */

const OPTIONS: { key: Theme; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: "light", label: "Light", desc: "Bright workspace", icon: <Sun size={16} /> },
  { key: "dark", label: "Dark", desc: "Night mode", icon: <Moon size={16} /> },
  { key: "system", label: "System", desc: "Follows device", icon: <Monitor size={16} /> },
];

function MiniPreview({ option, active }: { option: Theme; active: boolean }) {
  const dark = option === "dark";
  const sys = option === "system";
  return (
    <span
      aria-hidden
      className="block h-16 overflow-hidden rounded-lg border"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        background: sys ? "linear-gradient(90deg,#FFFFFF 50%,#0B1120 50%)" : dark ? "#0B1120" : "#FFFFFF",
      }}
    >
      <span className="flex gap-1 p-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: sys ? "#94A3B8" : dark ? "#334155" : "#E2E8F0" }} />
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: sys ? "#94A3B8" : dark ? "#334155" : "#E2E8F0" }} />
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#2563EB" }} />
      </span>
      <span className="mx-2 block h-1.5 rounded-full" style={{ background: sys ? "linear-gradient(90deg,#2563EB 50%,#60A5FA 50%)" : "#2563EB", opacity: 0.85 }} />
      <span className="mx-2 mt-1.5 flex gap-1">
        <span className="h-4 flex-1 rounded" style={{ background: dark ? "#1E293B" : "#F1F5F9" }} />
        <span className="h-4 flex-1 rounded" style={{ background: sys ? "linear-gradient(90deg,#F1F5F9 50%,#1E293B 50%)" : dark ? "#1E293B" : "#F1F5F9" }} />
      </span>
    </span>
  );
}

export function ThemePicker({ accent = "#2563EB" }: { accent?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Appearance">
        {OPTIONS.map((o) => {
          const active = theme === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(o.key)}
              className="group rounded-2xl border p-2.5 text-left transition-all hover:-translate-y-0.5"
              style={
                active
                  ? { borderColor: accent, boxShadow: `0 0 0 2px ${accent}33, 0 8px 20px rgba(15,23,42,.10)`, background: "var(--surface)" }
                  : { borderColor: "var(--border)", background: "var(--surface)" }
              }
            >
              <MiniPreview option={o.key} active={active} />
              <span className="mt-2 flex items-center gap-1.5 px-0.5">
                <span style={{ color: active ? accent : "var(--text-2)" }}>{o.icon}</span>
                <span className="text-sm font-bold">{o.label}</span>
                {active && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: accent }}>
                    <Check size={12} />
                  </span>
                )}
              </span>
              <span className="block px-0.5 pb-0.5 text-xs" style={{ color: "var(--text-2)" }}>{o.desc}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>
        System follows your device setting and updates automatically at sunset / sunrise.
      </p>
    </div>
  );
}

const ACCENT_OPTIONS: { key: Accent; label: string; desc: string; swatch: string }[] = [
  { key: "blue", label: "Blue", desc: "Default workspace", swatch: "#2563EB" },
  { key: "green", label: "Green", desc: "Fresh & calm", swatch: "#16A34A" },
  { key: "yellow", label: "Yellow", desc: "Warm & bold", swatch: "#D97706" },
];

export function AccentPicker() {
  const { accent, setAccent } = useTheme();
  return (
    <div>
      <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Dashboard color">
        {ACCENT_OPTIONS.map((o) => {
          const active = accent === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setAccent(o.key)}
              className="group rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5"
              style={
                active
                  ? { borderColor: o.swatch, boxShadow: `0 0 0 2px ${o.swatch}33, 0 8px 20px rgba(15,23,42,.10)`, background: "var(--surface)" }
                  : { borderColor: "var(--border)", background: "var(--surface)" }
              }
            >
              <span className="flex items-center gap-2.5">
                <span className="h-9 w-9 shrink-0 rounded-xl" style={{ background: o.swatch }} aria-hidden />
                <span>
                  <span className="block text-sm font-bold">{o.label}</span>
                  <span className="block text-xs" style={{ color: "var(--text-2)" }}>{o.desc}</span>
                </span>
                {active && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: o.swatch }}>
                    <Check size={12} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--text-2)" }}>
        Applies instantly across the dashboard — buttons, active nav, highlights and charts follow this color.
      </p>
    </div>
  );
}
