"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AccessDeniedPage() {
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const sb = createClient();
    if (!sb) return;
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      const { data: profile } = await sb
        .from("users")
        .select("rejected_reason")
        .eq("id", data.user.id)
        .single();
      setReason((profile as { rejected_reason?: string | null } | null)?.rejected_reason ?? null);
    });
  }, []);

  async function logout() {
    const sb = createClient();
    if (sb) await sb.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md">
        <div className="card w-full space-y-5 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl" style={{ background: "#FEE2E2" }}>🚫</div>
          <div>
            <p className="text-xl font-bold">Request not approved</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
              Your account request was not approved by the administrator.
            </p>
          </div>
          {email && (
            <p className="rounded-[10px] border px-4 py-2 text-sm font-medium" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {email}
            </p>
          )}
          {reason && (
            <div className="rounded-[10px] border p-4 text-left text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <p className="font-semibold">Reason</p>
              <p className="mt-1" style={{ color: "var(--text-2)" }}>{reason}</p>
            </div>
          )}
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            If you believe this is an error, please contact your administrator.
          </p>
          <button
            onClick={logout}
            className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white"
            style={{ background: "#DC2626" }}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
