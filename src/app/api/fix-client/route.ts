import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function POST() {
  try {
    const cookieStore = await cookies();
    
    // Use SSR client just to get the current user session
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Use service role client to bypass RLS and force-create the profile
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

    // 1. Check if client profile exists
    const { data: existing } = await adminClient
      .from("clients")
      .select("id")
      .eq("linked_user_id", user.id)
      .limit(1)
      .maybeSingle();
      
    if (existing) return NextResponse.json({ id: existing.id });

    // 2. Ensure firm exists
    let firmId = null;
    const { data: firms } = await adminClient.from("firms").select("id").limit(1);
    if (firms && firms.length > 0) {
      firmId = firms[0].id;
    } else {
      const { data: newFirm } = await adminClient
        .from("firms")
        .insert([{ name: "Default Firm" }])
        .select("id")
        .single();
      if (newFirm) firmId = newFirm.id;
    }

    if (!firmId) return NextResponse.json({ error: "Failed to resolve firm" }, { status: 500 });

    // 3. Create client profile
    const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "Client Profile";
    const email = user.email || "";
    const { data: newClient, error } = await adminClient
      .from("clients")
      .insert([{ firm_id: firmId, name, email, type: "individual", linked_user_id: user.id }])
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: newClient.id });
    
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
