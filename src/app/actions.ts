"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// A server action to guarantee a client profile exists for the logged-in user
export async function ensureClientProfile() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // fallback to anon if service missing, but usually service is needed for bypass
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
      },
    }
  );

  // 1. Get logged-in user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 2. Check if client profile already exists
  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .eq("linked_user_id", user.id)
    .limit(1)
    .maybeSingle();
    
  if (existing) return existing.id;

  // 3. We need to create one. First, get a firm.
  let firmId: string | null = null;
  const { data: firms } = await supabase.from("firms").select("id").limit(1);
  if (firms && firms.length > 0) {
    firmId = firms[0].id;
  } else {
    // If no firm exists, create a default one
    const { data: newFirm, error: firmErr } = await supabase
      .from("firms")
      .insert([{ name: "Default Firm" }])
      .select("id")
      .single();
    if (newFirm) firmId = newFirm.id;
  }

  if (!firmId) return null;

  // 4. Create the client profile
  const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "My Client Profile";
  
  const { data: newClient, error } = await supabase
    .from("clients")
    .insert([{
      firm_id: firmId,
      name: name,
      type: "individual",
      linked_user_id: user.id
    }])
    .select("id")
    .single();

  if (error) console.error("Auto-create client failed:", error);
  return newClient?.id || null;
}
