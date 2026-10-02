"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

function getInitial(): Theme {
  if (typeof document === "undefined") return "light";
  const c = document.cookie.match(/(?:^|; )taxdesk-theme=(light|dark)/)?.[1];
  if (c === "light" || c === "dark") return c;
  try {
    const ls = localStorage.getItem("taxdesk-theme");
    if (ls === "light" || ls === "dark") return ls as Theme;
  } catch {}
  return "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(getInitial());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    root.classList.toggle("dark", theme === "dark");
    document.cookie = `taxdesk-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
    try {
      localStorage.setItem("taxdesk-theme", theme);
    } catch {}
    const t = setTimeout(() => root.classList.remove("theme-anim"), 350);
    return () => clearTimeout(t);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
