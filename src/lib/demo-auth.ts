// Dummy demo auth — works without Supabase so reviewers can log in instantly.
// When NEXT_PUBLIC_SUPABASE_URL is set, real Supabase Auth is used instead.

export type DemoRole = "admin" | "employee" | "client";

export interface DemoUser {
  email: string;
  password: string;
  role: DemoRole;
  name: string;
}

export const DEMO_USERS: DemoUser[] = [
  { email: "admin@taxdesk.io", password: "Admin123!", role: "admin", name: "Amira Khan" },
  { email: "employee@taxdesk.io", password: "Employee123!", role: "employee", name: "Jonas Lee" },
  { email: "client@taxdesk.io", password: "Client123!", role: "client", name: "Acme Ltd" },
];

const KEY = "taxdesk-demo-session";

export function demoLogin(email: string, password: string): DemoUser | null {
  const u = DEMO_USERS.find(
    (d) => d.email.toLowerCase() === email.trim().toLowerCase() && d.password === password
  );
  if (!u) return null;
  try {
    localStorage.setItem(KEY, JSON.stringify({ email: u.email, role: u.role, name: u.name, at: Date.now() }));
  } catch {}
  return u;
}

export function demoSignup(name: string, email: string): DemoUser {
  const u: DemoUser = { email, password: "demo", role: "admin", name: name || "Demo Admin" };
  try {
    localStorage.setItem(KEY, JSON.stringify({ email: u.email, role: u.role, name: u.name, at: Date.now() }));
  } catch {}
  return u;
}

export function demoLogout() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
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
