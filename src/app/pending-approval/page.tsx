"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Pending Approval page
 *
 * Reads approval_status from /api/auth/me — a server-side API route that uses
 * the SERVICE ROLE to hit the database directly, bypassing:
 *   - Browser-side Supabase client caching
 *   - RLS policies (which can block pending users from reading their row)
 *   - Next.js fetch cache (the route is force-dynamic + no-store)
 *   - JWT claim staleness (user_metadata is not used)
 *
 * On top of polling, we also subscribe to Supabase Realtime for the user's own
 * row. Either mechanism can trigger the redirect — whichever fires first wins.
 */
export default function PendingApprovalPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const redirecting = useRef(false);

  /** Navigate to the dashboard — call only once. */
  const goToDashboard = useCallback(
    (role: string) => {
      if (redirecting.current) return;
      redirecting.current = true;
      setIsApproved(true);
      setStatusMsg(null);
      // Short delay so the success UI is visible before navigation.
      setTimeout(() => {
        router.replace(`/${role}/dashboard`);
        router.refresh();
      }, 1200);
    },
    [router]
  );

  /**
   * Fetch approval status from /api/auth/me (service-role, no-cache).
   * Returns true if the user is now approved (caller can skip further polling).
   */
  const checkStatus = useCallback(
    async (silent = false): Promise<boolean> => {
      if (!silent) {
        setChecking(true);
        setStatusMsg(null);
      }
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
        });

        if (res.status === 401) {
          // Session expired — send to login.
          router.replace("/login");
          return false;
        }

        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (!silent) {
            setStatusMsg(j.error ?? `Server error (${res.status})`);
            setStatusOk(false);
          }
          return false;
        }

        const data = (await res.json()) as {
          role?: string | null;
          approval_status?: string | null;
        };

        if (data.approval_status === "approved") {
          const role =
            data.role === "employee"
              ? "employee"
              : data.role === "admin"
              ? "admin"
              : "client";
          goToDashboard(role);
          return true;
        }

        if (data.approval_status === "rejected") {
          router.replace("/access-denied");
          return false;
        }

        // Still pending.
        if (!silent) {
          setStatusMsg("Still pending — your request is in the queue.");
          setStatusOk(false);
        }
        return false;
      } catch (e) {
        if (!silent) {
          setStatusMsg(
            e instanceof Error ? e.message : "Could not reach server"
          );
          setStatusOk(false);
        }
        return false;
      } finally {
        if (!silent) setChecking(false);
      }
    },
    [router, goToDashboard]
  );

  useEffect(() => {
    const sb = createClient();
    let cancelled = false;
    let channel: ReturnType<NonNullable<typeof sb>["channel"]> | null = null;

    // Get the current user's email for display, and their ID for the realtime filter.
    const init = async () => {
      if (!sb) return;
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (cancelled || !user) return;

      if (user.email) setEmail(user.email);

      // Initial status check on mount.
      const approved = await checkStatus(true);
      if (approved || cancelled) return;

      // --- Realtime subscription on the user's OWN row ---
      // When the admin updates approval_status, this fires immediately.
      const topic = `approval-watch-${user.id}`;
      // Drop stale same-topic channels from StrictMode / HMR remounts.
      for (const c of sb.getChannels()) {
        if (c.topic === topic || c.topic.endsWith(`:${topic}`)) {
          void sb.removeChannel(c);
        }
      }
      channel = sb
        .channel(topic)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "users",
            filter: `id=eq.${user.id}`,
          },
          () => {
            // Don't trust the payload — do a fresh server read.
            void checkStatus(true);
          }
        )
        .subscribe((status, err) => {
          if (err) {
            console.error("[pending-approval] realtime error", status, err);
          }
        });
    };

    void init();

    // Safety-net poll every 3 s in case Realtime is blocked (websocket, publication).
    const poll = setInterval(() => {
      void checkStatus(true);
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (sb && channel) void sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    const sb = createClient();
    if (sb) await sb.auth.signOut();
    router.replace("/login");
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-md">
        <div className="card w-full space-y-5 p-8 text-center">
          {/* Icon — swaps to checkmark once approved */}
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl transition-all duration-500"
            style={{
              background: isApproved ? "var(--success-bg)" : "var(--accent-tint)",
            }}
          >
            {isApproved ? "✅" : "⏳"}
          </div>

          {isApproved ? (
            <div className="space-y-4">
              <div>
                <p className="text-xl font-bold">Account Approved! 🎉</p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
                  Redirecting you to your dashboard…
                </p>
              </div>
              <button
                onClick={() => {
                  router.replace("/employee/dashboard");
                  router.refresh();
                }}
                className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                style={{ background: "linear-gradient(135deg,#16A34A,#15803D)" }}
              >
                Go to Dashboard →
              </button>
            </div>
          ) : (
            <div>
              <p className="text-xl font-bold">Waiting for approval</p>
              <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
                Your account is pending admin review. You will be redirected
                automatically once approved.
              </p>
            </div>
          )}

          {email && (
            <p
              className="rounded-[10px] border px-4 py-2 text-sm font-medium"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
              }}
            >
              {email}
            </p>
          )}

          {/* Status message from manual refresh */}
          {statusMsg && (
            <p
              className="rounded-xl px-3 py-2 text-xs font-semibold"
              style={
                statusOk
                  ? {
                      background: "var(--success-bg)",
                      color: "var(--success-tx)",
                    }
                  : {
                      background: "var(--danger-bg)",
                      color: "var(--danger-tx)",
                    }
              }
            >
              {statusMsg}
            </p>
          )}

          {!isApproved && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => checkStatus(false)}
                disabled={checking}
                className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "#2563EB" }}
              >
                {checking ? "Checking…" : "Refresh status"}
              </button>
              <button
                onClick={logout}
                className="btn-ghost w-full rounded-[10px] py-2.5 text-sm font-semibold"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
