import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const res = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res;

  const sb = createServerClient(url, key, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await sb.auth.getUser();

  // Unauthenticated — redirect to login
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Read role from JWT user_metadata (avoids RLS issues on public.users in middleware)
  const role = (user.user_metadata?.role as string) ?? null;

  // Enforce role-based route access
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL(role ? `/${role}/dashboard` : "/login", req.url));
  }
  if (pathname.startsWith("/employee") && role !== "employee") {
    return NextResponse.redirect(new URL(role ? `/${role}/dashboard` : "/login", req.url));
  }
  if (pathname.startsWith("/client") && role !== "client") {
    return NextResponse.redirect(new URL(role ? `/${role}/dashboard` : "/login", req.url));
  }

  return res;
}

export const config = { matcher: ["/admin/:path*", "/employee/:path*", "/client/:path*"] };
