export type DemoRole = "admin" | "employee" | "client";

const KEY = "taxdesk-demo-session";

export function demoLogout() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function demoSession(): { email: string; role: DemoRole; name: string } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
