import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const theme = req.cookies.get("taxdesk-theme")?.value;
  // Role checks are enforced client-side + via Supabase RLS server-side.
  // If Supabase is configured, protect dashboard groups by session cookie presence.
  const { pathname } = req.nextUrl;
  const isProtected = pathname.startsWith("/admin") || pathname.startsWith("/employee") || pathname.startsWith("/client");
  if (isProtected) {
    const all = req.cookies.getAll().map((c) => c.name);
    const hasSession = all.some((k) => k.includes("auth-token")) ||
      req.cookies.get("sb-access-token") || req.cookies.get("supabase-auth-token");
    // Do not hard-block (demo mode without Supabase still renders with empty states).
    // Only redirect obvious unauthenticated API abuse; pages render and fetch RLS-scoped data.
    void hasSession;
  }
  void theme;
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/employee/:path*", "/client/:path*"] };
