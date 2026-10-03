import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) return res;

  // ── 1. Identify the caller via their session cookie (anon client) ──────────
  const anon = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)
        );
      },
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });

  const { data: { user } } = await anon.auth.getUser();

  if (!user) {
    // Not signed in — only redirect if they're trying to access a protected route
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // ── 2. Read approval_status + role via SERVICE ROLE (bypasses RLS + cache) ─
  // The anon client reads users through RLS which calls is_approved() which
  // reads users again — a recursive loop that can return null and fall back to
  // "pending", blocking approved users. Service role has no such restriction.
  let approvalStatus = "pending";
  let dbRole: string | null = (user.user_metadata?.role as string) ?? null;

  if (serviceKey) {
    const svc = createServiceClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });

    const { data: row } = await svc
      .from("users")
      .select("approval_status, role")
      .eq("id", user.id)
      .single();

    const r = row as { approval_status?: string; role?: string } | null;
    if (r) {
      approvalStatus = r.approval_status ?? "pending";
      dbRole = r.role ?? dbRole;
    }
  } else {
    // Fallback when service key is not set (local dev without .env.local):
    // use anon client — still better than nothing.
    const { data: row } = await anon
      .from("users")
      .select("approval_status, role")
      .eq("id", user.id)
      .single();
    const r = row as { approval_status?: string; role?: string } | null;
    if (r) {
      approvalStatus = r.approval_status ?? "pending";
      dbRole = r.role ?? dbRole;
    }
  }

  // ── 3. Approval gate (admins are never blocked) ───────────────────────────
  if (dbRole !== "admin") {
    if (approvalStatus === "pending") {
      if (!pathname.startsWith("/pending-approval")) {
        return NextResponse.redirect(new URL("/pending-approval", req.url));
      }
      return res;
    }
    if (approvalStatus === "rejected") {
      if (!pathname.startsWith("/access-denied")) {
        return NextResponse.redirect(new URL("/access-denied", req.url));
      }
      return res;
    }
  }

  // ── 4. Approved users visiting /pending-approval go straight to dashboard ──
  if (pathname.startsWith("/pending-approval") && approvalStatus === "approved") {
    const dest = dbRole ? `/${dbRole}/dashboard` : "/login";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  // ── 5. Role-based route access ────────────────────────────────────────────
  if (pathname.startsWith("/admin") && dbRole !== "admin") {
    return NextResponse.redirect(new URL(dbRole ? `/${dbRole}/dashboard` : "/login", req.url));
  }
  if (pathname.startsWith("/employee") && dbRole !== "employee") {
    return NextResponse.redirect(new URL(dbRole ? `/${dbRole}/dashboard` : "/login", req.url));
  }
  if (pathname.startsWith("/client") && dbRole !== "client") {
    return NextResponse.redirect(new URL(dbRole ? `/${dbRole}/dashboard` : "/login", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/employee/:path*", "/client/:path*", "/pending-approval", "/access-denied"],
};
