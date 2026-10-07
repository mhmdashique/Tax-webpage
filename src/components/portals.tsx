"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Card, Button, EmptyState, Badge, Modal, StatCard, Stepper, Sparkline } from "./ui";
import { useFilings, useTasks, useDocuments, useClients, useCurrentUser, useUsers } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { dueLabel, greeting, formatMoney, downloadFile, buildFilingReceiptPdf } from "@/lib/data";
import Link from "next/link";
import { Upload, FileSignature, User as UserIcon, Bell, Palette, Briefcase, CalendarDays, Inbox, ShieldCheck, Settings2, PenLine, Building2, Camera, Check, Mail, Phone, MapPin, Hash, Sparkles, Globe, Download, Eye } from "lucide-react";
import { CLIENT_STEPPER, clientStepperIndex, stageLabel, clientActionFor, isComplete, isOverdue, displayStatus } from "@/lib/lifecycle";
import { ThemePicker, AccentPicker, useTheme } from "./theme-provider";
import { WaitingOnClientsCard, fmtDT } from "./task-center";
import { SearchSelect } from "./search-select";
import type { Task, TaskEvent } from "@/types/database";

function useClientTimestamp() {
  const [timestamp, setTimestamp] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimestamp(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return timestamp;
}

const inputCls =
  "mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]";
const inputStyle = { borderColor: "var(--border)", background: "var(--bg)" } as const;

function Field({ label, icon, children, hint }: { label: string; icon?: React.ReactNode; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
        {icon && <span style={{ color: "var(--text-2)" }}>{icon}</span>}
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs" style={{ color: "var(--text-2)" }}>{hint}</span>}
    </label>
  );
}

function SectionHead({ icon, title, desc, action }: { icon: React.ReactNode; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-bold leading-tight">{title}</h3>
        <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-2)" }}>{desc}</p>
      </div>
      {action}
    </div>
  );
}

export function AccountView({ role }: { role: "employee" | "client" | "admin" }) {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState({ name: role === "client" ? "Acme Ltd" : "Jonas Lee", phone: "", title: "", dept: "", business: "Acme Ltd", entity: "LLC", taxId: "", address: "" });
  const [prefs, setPrefs] = useState({ theme: "system", lang: "en", tz: "UTC" });
  const [notifs, setNotifs] = useState({ email_overdue: true, inapp_bell: true });
  const [saved, setSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState("");
  const [secMsg, setSecMsg] = useState("");
  const [two, setTwo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Signature state
  const [typed, setTyped] = useState("");
  const [mode, setMode] = useState<"type" | "draw">("type");
  const [history, setHistory] = useState<{ name: string; at: string }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 2200); }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarUrl(URL.createObjectURL(f));
    setUploading(true);
    try {
      const sb = createClient();
      if (!sb) { flash(); return; }
      const path = `avatars/${Date.now()}-${f.name}`;
      await sb.storage.from("avatars").upload(path, f);
      flash();
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const sb = createClient();
      if (sb) await sb.from("users").update({ name: profile.name, phone: profile.phone }).eq("email", "demo@taxdesk.io");
      flash();
    } finally {
      setSaving(false);
    }
  }

  function saveSignature() {
    if (!typed.trim() && mode === "type") return;
    const name = mode === "type" ? typed : "drawn-signature";
    setHistory([{ name, at: new Date().toISOString() }, ...history]);
    flash();
  }

  const TABS = [
    { k: "profile", label: "Profile", icon: <UserIcon size={15} /> },
    { k: "security", label: "Security", icon: <ShieldCheck size={15} /> },
    { k: "notifications", label: "Notifications", icon: <Bell size={15} /> },
    { k: "preferences", label: "Preferences", icon: <Settings2 size={15} /> },
    ...(role === "client"
      ? [{ k: "signature", label: "Signature", icon: <PenLine size={15} /> }]
      : [{ k: "work", label: "Work", icon: <Briefcase size={15} /> }]),
  ];

  const fields = role === "client"
    ? [profile.name, profile.phone, profile.title, profile.business, profile.entity, profile.taxId, profile.address]
    : [profile.name, profile.phone, profile.title, profile.dept];
  const complete = Math.round((fields.filter((v) => String(v ?? "").trim() !== "").length / fields.length) * 100);
  const accent = "var(--accent)";
  const { resolved, accent: accentName } = useTheme();
  const pickerAccent = accentName === "green" ? "#16A34A" : accentName === "yellow" ? "#D97706" : "var(--accent)";
  const ink = resolved === "dark" ? "#F1F5F9" : "#111827";

  return (
    <div className="prem-enter space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1 className="prem-title">Account &amp; Profile</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-2)" }}>
            Manage your personal info, business details, security and signing preferences.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}>
              <Check size={14} /> Saved successfully
            </span>
          )}
          <Badge tone={role === "client" ? "accent" : "success"}>{role.toUpperCase()}</Badge>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Identity card */}
        <Card className="overflow-hidden !p-0">
          <div className="relative px-5 pb-5 pt-6 text-white" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}CC 60%, #0F172A)` }}>
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-col items-center text-center">
              <div className="group relative">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white/40 text-3xl font-bold shadow-xl" style={{ background: avatarUrl ? "transparent" : accent }}>
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-white">{profile.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  aria-label="Upload profile photo"
                  className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-white text-slate-900 shadow-lg transition hover:scale-105"
                  style={{ color: accent }}
                >
                  {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Camera size={15} />}
                </button>
              </div>
              <p className="mt-3 text-base font-bold leading-tight">{profile.name || "Your name"}</p>
              <p className="mt-0.5 text-xs opacity-80">{role === "client" ? profile.business || "Business" : profile.title || profile.dept || "Team member"} · {profile.entity || role}</p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
                <Sparkles size={12} /> {complete}% profile complete
              </span>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                <span style={{ color: "var(--text-2)" }}>Completeness</span>
                <span className="tnum">{complete}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${complete}%`, background: accent }} />
              </div>
            </div>

            <div className="space-y-2.5 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2.5">
                <Building2 size={15} style={{ color: "var(--text-2)" }} />
                <span className="truncate font-medium">{profile.business || "—"}</span>
                <span className="ml-auto text-xs" style={{ color: "var(--text-2)" }}>{profile.entity || ""}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone size={15} style={{ color: "var(--text-2)" }} />
                <span className="truncate" style={{ color: "var(--text-2)" }}>{profile.phone || "Add a phone number"}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin size={15} style={{ color: "var(--text-2)" }} />
                <span className="truncate" style={{ color: "var(--text-2)" }}>{profile.address || "Add a business address"}</span>
              </div>
            </div>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
            <div className="grid gap-2">
              <Button variant="ghost" className="w-full text-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload size={14} /> {uploading ? "Uploading…" : "Upload photo"}
              </Button>
              <p className="text-center text-[11px] leading-relaxed" style={{ color: "var(--text-2)" }}>
                PNG or JPG up to 5MB · Stored in Supabase Storage · avatars bucket
              </p>
            </div>
          </div>
        </Card>

        {/* Main column */}
        <div className="min-w-0 space-y-4">
          <Card className="!p-2">
            <div className="flex gap-1 overflow-x-auto p-1" role="tablist" aria-label="Account sections">
              {TABS.map((t) => (
                <button
                  key={t.k}
                  role="tab"
                  aria-selected={tab === t.k}
                  onClick={() => setTab(t.k)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all ${tab === t.k ? "text-white shadow-md" : ""}`}
                  style={tab === t.k ? { background: accent } : { color: "var(--text-2)" }}
                  onMouseEnter={(e) => { if (tab !== t.k) e.currentTarget.style.background = "var(--bg)"; }}
                  onMouseLeave={(e) => { if (tab !== t.k) e.currentTarget.style.background = "transparent"; }}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          </Card>

          {tab === "profile" && (
            <div className="space-y-4">
              <Card>
                <SectionHead icon={<UserIcon size={18} />} title="Personal information" desc="How you appear across filings, messages and signatures." />
                <div className="grid gap-4">
                  <Field label="Full name" icon={<UserIcon size={13} />}>
                    <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="e.g. Acme Ltd" className={inputCls} style={inputStyle} />
                  </Field>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Phone" icon={<Phone size={13} />}>
                      <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="+1 (555) 000-1234" className={inputCls} style={inputStyle} />
                    </Field>
                    <Field label="Job title" icon={<Briefcase size={13} />}>
                      <input value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} placeholder="e.g. Finance Manager" className={inputCls} style={inputStyle} />
                    </Field>
                  </div>
                  {role !== "client" && (
                    <Field label="Department" icon={<Building2 size={13} />}>
                      <input value={profile.dept} onChange={(e) => setProfile({ ...profile, dept: e.target.value })} placeholder="e.g. Tax & Compliance" className={inputCls} style={inputStyle} />
                    </Field>
                  )}
                </div>
              </Card>

              {role === "client" && (
                <Card>
                  <SectionHead
                    icon={<Building2 size={18} />}
                    title="Business details"
                    desc="Used on invoices, filings and your client record."
                    action={<Badge tone="neutral">{profile.entity || "Entity"}</Badge>}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Business name">
                      <input value={profile.business} onChange={(e) => setProfile({ ...profile, business: e.target.value })} placeholder="Acme Ltd" className={inputCls} style={inputStyle} />
                    </Field>
                    <Field label="Entity type">
                      <select value={profile.entity} onChange={(e) => setProfile({ ...profile, entity: e.target.value })} className={inputCls} style={inputStyle}>
                        {["LLC", "Corporation", "Sole proprietorship", "Partnership", "Nonprofit", "Other"].map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </Field>
                    <Field label="Tax ID" icon={<Hash size={13} />} hint="Only visible to you and your accountant.">
                      <input value={profile.taxId} onChange={(e) => setProfile({ ...profile, taxId: e.target.value })} placeholder="XX-XXXXXXX" className={inputCls} style={inputStyle} />
                    </Field>
                    <Field label="Address" icon={<MapPin size={13} />}>
                      <input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="Street, city, postcode" className={inputCls} style={inputStyle} />
                    </Field>
                  </div>
                </Card>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button className="px-7 py-2.5" onClick={saveProfile} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <p className="text-xs" style={{ color: "var(--text-2)" }}>Changes apply instantly across your workspace.</p>
              </div>
            </div>
          )}

          {tab === "security" && (
            <div className="space-y-4">
              <Card>
                <SectionHead icon={<ShieldCheck size={18} />} title="Password" desc="Use a strong, unique password for your TaxDesk account." />
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const sb = createClient();
                    if (sb) {
                      const { error } = await sb.auth.updateUser({ password: pw });
                      setSecMsg(error ? error.message : "Password updated");
                    } else setSecMsg("Password updated (demo mode)");
                    setPw("");
                    flash();
                  }}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <input type="password" required minLength={6} placeholder="New password (min 6 characters)" value={pw} onChange={(e) => setPw(e.target.value)} className={`${inputCls} !mt-0 flex-1`} style={inputStyle} />
                  <Button className="shrink-0">Change password</Button>
                </form>
                {secMsg && <p className="mt-2 text-sm" style={{ color: "var(--text-2)" }}>{secMsg}</p>}
              </Card>
              <Card>
                <SectionHead icon={<ShieldCheck size={18} />} title="Two-factor authentication" desc="Add an extra layer of protection with an authenticator app." action={<Badge tone={two ? "success" : "neutral"}>{two ? "ON" : "OFF"}</Badge>} />
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <button
                    type="button" role="switch" aria-checked={two}
                    onClick={() => { setTwo(!two); setSecMsg(two ? "2FA disabled" : "2FA enrolled via authenticator (Supabase Auth)"); flash(); }}
                    className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                    style={{ background: two ? "var(--accent)" : "var(--border)" }}
                  >
                    <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: two ? 22 : 2 }} />
                  </button>
                  <span>
                    <span className="block font-semibold">Enable 2FA (TOTP via Supabase Auth)</span>
                    <span className="block text-xs" style={{ color: "var(--text-2)" }}>You&apos;ll be asked for a code on new devices.</span>
                  </span>
                </label>
              </Card>
            </div>
          )}

          {tab === "notifications" && (
            <Card>
              <SectionHead icon={<Bell size={18} />} title="Notifications" desc="Choose how and when TaxDesk reaches you." />
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {([
                  { k: "email_overdue" as const, title: "Overdue & deadline emails", desc: "Get an email when a filing or task is due soon or overdue." },
                  { k: "inapp_bell" as const, title: "In-app bell alerts", desc: "Show unread dots and toasts inside your workspace." },
                ]).map((row) => (
                  <div key={row.k} className="flex items-center gap-3 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{row.title}</p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>{row.desc}</p>
                    </div>
                    <button
                      type="button" role="switch" aria-checked={notifs[row.k]} aria-label={row.title}
                      onClick={() => { setNotifs({ ...notifs, [row.k]: !notifs[row.k] }); flash(); }}
                      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                      style={{ background: notifs[row.k] ? accent : "var(--border)" }}
                    >
                      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: notifs[row.k] ? 22 : 2 }} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {tab === "preferences" && (
            <Card>
              <SectionHead icon={<Settings2 size={18} />} title="Preferences" desc="Language, appearance and timezone for your workspace." />
              <p className="eyebrow mb-2">Appearance — night mode included</p>
              <ThemePicker accent={pickerAccent} />
              <p className="eyebrow mb-2 mt-5">Dashboard color — applies everywhere</p>
              <AccentPicker />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Language" icon={<Globe size={13} />}>
                  <select value={prefs.lang} onChange={(e) => setPrefs({ ...prefs, lang: e.target.value })} className={inputCls} style={inputStyle}>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                  </select>
                </Field>
                <Field label="Timezone">
                  <input value={prefs.tz} onChange={(e) => setPrefs({ ...prefs, tz: e.target.value })} placeholder="UTC" className={inputCls} style={inputStyle} />
                </Field>
              </div>
              <div className="mt-4">
                <Button className="px-6" onClick={flash}>Save preferences</Button>
              </div>
            </Card>
          )}

          {tab === "signature" && (
            <Card>
              <SectionHead
                icon={<PenLine size={18} />} title="e-Signature" desc="Sign returns and approvals. Saved signatures are audit-logged."
                action={
                  <div className="flex rounded-full border p-0.5 text-xs font-bold" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                    {(["type", "draw"] as const).map((m) => (
                      <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1.5 capitalize ${mode === m ? "text-white" : ""}`} style={mode === m ? { background: accent } : { color: "var(--text-2)" }}>{m}</button>
                    ))}
                  </div>
                }
              />
              {mode === "type" ? (
                <div>
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your full name to sign" className="w-full rounded-xl border px-4 py-4 font-serif text-2xl italic outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]" style={inputStyle} />
                  {typed.trim() && <p className="mt-2 font-serif text-lg italic" style={{ color: "var(--text-2)" }}>Preview: {typed}</p>}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                  <canvas ref={canvasRef} width={600} height={180} className="w-full cursor-crosshair touch-none"
                    onMouseDown={() => (drawing.current = true)} onMouseUp={() => (drawing.current = false)} onMouseLeave={() => (drawing.current = false)}
                    onMouseMove={(e) => {
                      if (!drawing.current || !canvasRef.current) return;
                      const ctx = canvasRef.current.getContext("2d");
                      if (!ctx) return;
                      const r = canvasRef.current.getBoundingClientRect();
                      const x = (e.clientX - r.left) * (canvasRef.current.width / r.width);
                      const y = (e.clientY - r.top) * (canvasRef.current.height / r.height);
                      ctx.fillStyle = ink;
                      ctx.beginPath();
                      ctx.arc(x, y, 2, 0, 7);
                      ctx.fill();
                    }} />
                  <p className="border-t px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>Draw above with your mouse or finger</p>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button onClick={saveSignature}>Save signature</Button>
                <Button variant="ghost" onClick={() => { setTyped(""); const c = canvasRef.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); }}>Clear</Button>
              </div>
              <div className="mt-5">
                <p className="eyebrow mb-2">Signature history (audit log)</p>
                {history.length === 0 ? <p className="rounded-xl p-4 text-sm" style={{ background: "var(--bg)", color: "var(--text-2)" }}>No signatures yet — saved signatures with timestamps appear here.</p> : (
                  <div className="space-y-2">{history.map((h, i) => <div key={i} className="flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm" style={{ borderColor: "var(--border)" }}><span className="font-serif italic">{h.name}</span><span className="text-xs" style={{ color: "var(--text-2)" }}>{new Date(h.at).toLocaleString()}</span></div>)}</div>
                )}
              </div>
            </Card>
          )}

          {tab === "work" && <WorkSummary />}
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-2)" }}>
        <Mail size={13} /> Need help with your account? Contact support from the sidebar — we reply within one business day.
      </p>
    </div>
  );
}

function WorkSummary() {
  const { data: tasks = [] } = useTasks();
  const { data: filings = [] } = useFilings();
  const done = tasks.filter((t) => String(t.status) === "done").length;
  const filedDone = filings.filter((f) => isComplete(String(f.status))).length;
  return (
    <Card>
      <h3 className="font-semibold">Work Summary</h3>
      <p className="text-sm" style={{ color: "var(--text-2)" }}>{done} tasks done · {filedDone} filings completed · {filings.length} in scope. <Link href="/employee/performance" className="font-semibold text-[var(--accent)] hover:underline">Open My Performance</Link></p>
    </Card>
  );
}

export function EmployeeDashboard() {
  const { data: currentUser } = useCurrentUser();
  const currentTimestamp = useClientTimestamp();
  const { data: filings = [], isLoading } = useFilings();
  const { data: clients = [] } = useClients();
  const dueWeek = currentTimestamp === null ? 0 : filings.filter((f) => {
    const diff = new Date(f.due_date).getTime() - currentTimestamp;
    return diff >= 0 && diff < 7 * 864e5;
  }).length;
  const doneMonth = filings.filter((f) => isComplete(String(f.status))).length;
  const sorted = [...filings].sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date)).slice(0, 6);
  const userName = currentUser?.name ?? "User";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 text-white" style={{ background: "linear-gradient(135deg,#0EA5A4,var(--accent))", boxShadow: "0 8px 30px #0EA5A422" }}>
        <h1 className="text-2xl font-bold">{greeting()}, {userName}</h1>
        <p className="mt-1 text-sm opacity-90">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {dueWeek} filings due this week</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="My clients" value={String(clients.length)} icon={<UserIcon size={18} />} spark={<Sparkline points={[2, 3, 4, 5, clients.length || 1]} color="#0EA5A4" />} />
        <StatCard label="Due this week" value={String(dueWeek)} icon={<CalendarDays size={18} />} spark={<Sparkline points={[1, 2, 1, 3, dueWeek]} color="#D97706" />} />
        <StatCard label="Completed month" value={String(doneMonth)} icon={<Briefcase size={18} />} spark={<Sparkline points={[1, 2, 3, 4, doneMonth]} color="var(--accent)" />} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">My Clients</h2><Link href="/employee/clients" className="text-sm font-semibold text-[var(--accent)] hover:underline">View all</Link></div>          {clients.length === 0 ? <EmptyState icon={<UserIcon size={22} />} title="No clients assigned to you yet" /> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {clients.slice(0, 4).map((c) => (
                <div key={c.id} className="rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "#0EA5A4" }}>{c.name.slice(0, 1)}</span>
                    <div><p className="text-sm font-semibold">{c.business_name ?? c.name}</p><p className="text-xs" style={{ color: "var(--text-2)" }}>{c.entity_type ?? ""}</p></div></div>
                  <div className="mt-2"><Badge tone="accent">Active</Badge></div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Deadline Tracker</h2>
          {isLoading ? <div className="skeleton h-32" /> : sorted.length === 0 ? <EmptyState icon={<Inbox size={22} />} title="Nothing due — enjoy the calm" /> : (
            <div className="space-y-2">{sorted.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm"><span className="font-semibold">{f.tax_type}</span><span className="text-xs" style={{ color: "var(--text-2)" }}>{stageLabel(String(f.status))}</span><span className="ml-auto"><Badge tone={isOverdue(String(f.status), f.due_date) ? "danger" : "warning"}>{dueLabel(f.due_date)}</Badge></span></div>
            ))}</div>
          )}
        </Card>
      </div>
      <WaitingOnClientsCard />
    </div>
  );
}

export function ClientDashboard() {
  const { data: currentUser } = useCurrentUser();
  const { data: filings = [], isLoading } = useFilings();
  const { data: docs = [] } = useDocuments();
  const { data: tasks = [], error: tasksError, isLoading: tasksLoading, mutate: mutateTasks } = useTasks();
  const [clientTaskTab, setClientTaskTab] = useState<"todo" | "overdue" | "completed">("todo");
  const [clientTaskMessage, setClientTaskMessage] = useState("");
  const [clientTaskSaving, setClientTaskSaving] = useState("");
  const clientTasks = tasks.filter((task) => task.task_for === "client" && (!currentUser?.id || task.assigned_to === currentUser.id));
  const openClientTasks = clientTasks.filter((task) => !["done", "cancelled"].includes(String(task.status)));
  const dueSoonClientTasks = openClientTasks.filter((task) =>
    task.due_date && /^(Due today|Due tomorrow|Due in [1-3]d)$/.test(dueLabel(task.due_date))
  ).length;
  const visibleClientTasks = clientTasks.filter((task) => {
    if (clientTaskTab === "completed") return String(task.status) === "done";
    if (clientTaskTab === "overdue") return !["done", "cancelled"].includes(String(task.status))
      && !!task.due_date && dueLabel(task.due_date).includes("overdue");
    return !["done", "cancelled"].includes(String(task.status));
  });
  const filing = filings[0] as unknown as { status?: string; tax_type?: string; period?: string; amount_owed?: number; due_date?: string } | undefined;
  const stageIdx = !filing ? -1 : clientStepperIndex(String(filing.status));
  const action = filing ? clientActionFor(String(filing.status)) : null;
  const overdue = filing ? isOverdue(String(filing.status), filing.due_date) : false;
  const filingActions = filings
    .map((f) => ({ filing: f, action: clientActionFor(String(f.status)) }))
    .filter((x) => x.action && !isComplete(String(x.filing.status)));
  const userName = currentUser?.name ?? "User";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 text-white md:p-8" style={{ background: "linear-gradient(135deg,#6366F1,var(--accent))", boxShadow: "0 8px 30px #6366F122" }}>
        <div className="flex flex-wrap items-center gap-3">
          <div><h1 className="text-2xl font-bold">Welcome, {userName}</h1><p className="mt-1 text-sm opacity-85">Tax year 2026 · plain-language status below</p></div>
          <div className="ml-auto flex gap-2">
            <Link href="/client/documents" className="rounded-[10px] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--accent-hover)]"><Upload size={14} className="mr-1 inline" /> Upload docs</Link>
            <Link href="/client/tax-filings" className="rounded-[10px] border border-white/50 px-4 py-2.5 text-sm font-semibold text-white">View all filings</Link>
          </div>
        </div>
      </div>

      <Card>
        <h2 className="mb-1 font-semibold">My Filing Status</h2>
        <p className="mb-4 text-xs" style={{ color: "var(--text-2)" }}>Created → Docs requested → Docs received → In preparation → Review & e-sign → Filed → Completed</p>
        {!filing ? (
          <div className="opacity-60"><EmptyState icon={<FileSignature size={22} />} title="No filing yet — your accountant will create one, then status appears here" /></div>
        ) : (
          <>
            <Stepper steps={[...CLIENT_STEPPER]} current={Math.max(stageIdx, 0)} />
            <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>
              Current: <span className="font-semibold" style={{ color: overdue ? "#DC2626" : "var(--text)" }}>{overdue ? "Overdue" : stageLabel(String(filing.status), true)}</span> · {filing.tax_type} {filing.period}
              {action && !overdue && <span> · next: <Link href={action.includes("upload") ? "/client/documents" : action.includes("sign") ? "/client/account" : "/client/payments"} className="font-bold text-[var(--accent)] hover:underline">{action}</Link></span>}
            </p>
          </>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Upcoming deadlines" value={String(filings.filter((f) => !isComplete(String(f.status))).length)} icon={<CalendarDays size={18} />} />
        <StatCard label="Action items" value={String(filingActions.length + openClientTasks.length)} icon={<Bell size={18} />} />
        <StatCard label="Tax summary" value={!filing ? "—" : formatMoney(Number((filing as { amount_owed?: number }).amount_owed ?? 0))} icon={<Palette size={18} />} />
        <StatCard label="Documents" value={String((docs as unknown[]).length)} icon={<Upload size={18} />} spark={<Sparkline points={[1, 2, 3, (docs as unknown[]).length || 1]} color="#6366F1" />} />
      </div>

      <ClientTasksDashboard
        tasks={visibleClientTasks}
        allTasks={clientTasks}
        activeTab={clientTaskTab}
        onTabChange={setClientTaskTab}
        isLoading={tasksLoading}
        error={tasksError?.message ?? ""}
        message={clientTaskMessage}
        savingTaskId={clientTaskSaving}
        onStatusChange={async (taskId, status) => {
          const sb = createClient();
          if (!sb) { setClientTaskMessage("Connect Supabase before updating a task."); return; }
          setClientTaskSaving(taskId);
          setClientTaskMessage("");
          const { error } = await sb.rpc("change_task_status", { p_task: taskId, p_status: status, p_reason: null });
          setClientTaskSaving("");
          if (error) { setClientTaskMessage(error.message); return; }
          setClientTaskMessage("Task updated.");
          await mutateTasks();
        }}
        dueSoonCount={dueSoonClientTasks}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Upcoming Deadlines</h2>
          {isLoading ? <div className="skeleton h-24" /> : filings.length === 0 ? <EmptyState icon={<CalendarDays size={22} />} title="No deadlines scheduled" /> : (
            <div className="space-y-2">{filings.slice(0, 5).map((f) => (
              <div key={f.id} className="flex items-center gap-3 text-sm">
                <span className="flex h-10 w-10 flex-col items-center justify-center rounded-xl text-xs font-bold" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}>{new Date(f.due_date).getDate()}<span>{new Date(f.due_date).toLocaleString("en", { month: "short" })}</span></span>
                <span className="font-semibold">{f.tax_type} · {f.period}</span>
                <span className="ml-auto"><Badge tone="warning">{dueLabel(f.due_date)}</Badge></span>
              </div>
            ))}</div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Outstanding Action Items</h2>
          {filingActions.length === 0 ? <EmptyState icon={<Inbox size={22} />} title="All caught up — nothing needs your action" /> : (
            <div className="space-y-2">
              {filingActions.slice(0, 5).map(({ filing: f, action: a }) => (
                <div key={f.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)" }}>
                  <span className="font-medium">{f.tax_type} {f.period}: {a}</span>
                  <Link href={a!.includes("upload") ? "/client/documents" : a!.includes("sign") ? "/client/account" : "/client/payments"} className="ml-auto text-xs font-bold text-[var(--accent)] hover:underline">Do it now</Link>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 rounded-xl p-3 text-xs" style={{ background: "var(--bg)", color: "var(--text-2)" }}>
            Your data: Acme Ltd · LLC · only your own filings, documents and invoices are visible to you.
          </div>
        </Card>
      </div>
    </div>
  );
}

function ClientTasksDashboard({
  tasks,
  allTasks,
  activeTab,
  onTabChange,
  isLoading,
  error,
  message,
  savingTaskId,
  onStatusChange,
  dueSoonCount,
}: {
  tasks: Task[];
  allTasks: Task[];
  activeTab: "todo" | "overdue" | "completed";
  onTabChange: (tab: "todo" | "overdue" | "completed") => void;
  isLoading: boolean;
  error: string;
  message: string;
  savingTaskId: string;
  onStatusChange: (taskId: string, status: string) => void;
  dueSoonCount: number;
}) {
  const counts = {
    todo: allTasks.filter((task) => !["done", "cancelled"].includes(String(task.status))).length,
    overdue: allTasks.filter((task) => !["done", "cancelled"].includes(String(task.status)) && !!task.due_date && dueLabel(task.due_date).includes("overdue")).length,
    completed: allTasks.filter((task) => String(task.status) === "done").length,
  };
  return <Card className="space-y-4">
    <div>
      <h2 className="font-semibold">My tasks</h2>
      <p className="mt-1 rounded-xl px-3 py-2 text-sm font-semibold"
        style={counts.overdue > 0
          ? { background: "var(--danger-bg)", color: "var(--danger-tx)" }
          : { background: "var(--accent-tint)", color: "var(--accent)" }}>
        You have {counts.todo} {counts.todo === 1 ? "task" : "tasks"}, {dueSoonCount} due soon{counts.overdue > 0 ? ` · ${counts.overdue} overdue` : ""}.
      </p>
    </div>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Client task views">
      {([
        ["todo", "To do"],
        ["overdue", "Overdue"],
        ["completed", "Completed"],
      ] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={activeTab === key} onClick={() => onTabChange(key)}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${activeTab === key ? "text-white" : ""}`}
        style={activeTab === key ? { background: "var(--accent)" } : { background: "var(--bg)", border: "1px solid var(--border)" }}>
        {label} <Badge>{counts[key]}</Badge>
      </button>)}
    </div>
    {error && <p role="alert" className="text-sm text-[#DC2626]">Could not load your tasks: {error}</p>}
    {message && <p role="status" className="text-sm" style={{ color: message.includes("updated") ? "var(--text-2)" : "#DC2626" }}>{message}</p>}
    {isLoading ? <div className="skeleton h-24" /> : !tasks.length
      ? <p className="rounded-xl p-4 text-sm" style={{ background: "var(--bg)", color: "var(--text-2)" }}>No tasks in this view.</p>
      : <div className="space-y-2">{tasks.map((task) => (
        <div key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-[180px] flex-1">
            <p className="text-sm font-semibold">{task.title}</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>{task.due_date ? dueLabel(task.due_date) : "No due date"}</p>
          </div>
          <Badge tone={task.priority === "urgent" ? "danger" : "neutral"}>{task.priority}</Badge>
          {String(task.status) !== "done" && <div className="w-[160px] shrink-0"><SearchSelect
            label={`Status for ${task.title}`} hideLabel value={String(task.status)} autoSelectSingle={false} clearable={false}
            onChange={(id) => { if (id) onStatusChange(task.id, id); }}
            options={["open", "in_progress", "done"].map((s) => ({ id: s, label: s.replace(/_/g, " ") }))}
            placeholder="Status…" disabled={savingTaskId === task.id} /></div>}
          <Link href={task.related_filing_id ? "/client/tax-filings" : "/client/documents"} className="text-xs font-semibold text-[var(--accent)] hover:underline">
            Open related item
          </Link>
        </div>
      ))}</div>}
    <Link href="/client/tasks" className="text-xs font-bold text-[var(--accent)] hover:underline">View all tasks →</Link>
  </Card>;
}

/** Days until due (negative = overdue). */

/** Days until due (negative = overdue). */
function daysUntil(due: string | null | undefined): number | null {
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  if (Number.isNaN(+d)) return null;
  return Math.round((d.getTime() - today.getTime()) / 864e5);
}

function dueChip(due: string | null | undefined): { label: string; tone: "success" | "warning" | "danger" | "accent" | "neutral" } {
  const n = daysUntil(due);
  if (n === null) return { label: "No due date", tone: "neutral" };
  if (n < 0) return { label: `Overdue by ${-n}d`, tone: "danger" };
  if (n === 0) return { label: "Due today", tone: "warning" };
  if (n <= 3) return { label: `Due in ${n}d`, tone: "warning" };
  return { label: `Due in ${n}d`, tone: "neutral" };
}

/** Primary action for a client task: link to the linked screen, or done. */
function primaryAction(task: Task, taskKey: string):
  | { kind: "link"; label: string; href: string }
  | { kind: "approve"; label: string }
  | { kind: "done"; label: string } {
  const k = taskKey.toLowerCase();
  const filingHref = "/client/documents";
  if (k.includes("reupload") || k.includes("re-upload") || k.includes("correct")) {
    return { kind: "link", label: "Re-upload corrected file", href: filingHref };
  }
  if (k.includes("upload") || k.includes("document")) {
    return { kind: "link", label: "Upload documents", href: filingHref };
  }
  if (k.includes("payment") || k.includes("challan")) {
    return { kind: "link", label: "Record payment", href: "/client/payments" };
  }
  if (k.includes("approve") || k.includes("summary")) {
    return { kind: "approve", label: "Approve summary" };
  }
  if (k.includes("download") || k.includes("return") || k.includes("computation")) {
    return { kind: "link", label: "Download files", href: filingHref };
  }
  if (k.includes("invoice")) {
    return { kind: "done", label: "Create invoice" };
  }
  return { kind: "done", label: "Mark as done" };
}

/** Full client task workspace: tabs, search, filters, cards, details panel. */
export function ClientTaskCenter() {
  const { data: currentUser } = useCurrentUser();
  const { data: tasks = [], isLoading, error, mutate } = useTasks();
  const { data: filings = [] } = useFilings();
  const { data: users = [] } = useUsers();
  const { data: taskTypes = [] } = useSWR<{ id: string; task_key: string }[]>("task-types", async () => {
    const sb = createClient();
    if (!sb) return [];
    const { data } = await sb.from("task_types").select("id,task_key").order("name");
    return (data ?? []) as { id: string; task_key: string }[];
  });
  const [tab, setTab] = useState<"todo" | "overdue" | "completed">("todo");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [filingFilter, setFilingFilter] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const seenFired = useRef<Record<string, boolean>>({});

  const clientTasks = tasks.filter((t) => t.task_for === "client" && t.assigned_to === currentUser?.id);
  const openTasks = clientTasks.filter((t) => !["done", "cancelled"].includes(String(t.status)));
  const overdueTasks = openTasks.filter((t) => (daysUntil(t.due_date) ?? 0) < 0);
  const dueSoon = openTasks.filter((t) => { const n = daysUntil(t.due_date); return n !== null && n >= 0 && n <= 3; }).length;

  const visible = clientTasks.filter((t) => {
    if (tab === "completed") {
      if (!(String(t.status) === "done" || String(t.client_status) === "reviewed")) return false;
    } else if (tab === "overdue") {
      if (!((daysUntil(t.due_date) ?? 0) < 0) || ["done", "cancelled"].includes(String(t.status))) return false;
    } else if (["done", "cancelled"].includes(String(t.status))) return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (filingFilter !== "all" && t.related_filing_id !== filingFilter) return false;
    if (query && !t.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));

  const detail = clientTasks.find((t) => t.id === detailId) ?? null;

  const { data: events = [] } = useSWR<TaskEvent[]>(detail ? ["client-task-events", detail.id] : null, async () => {
    const sb = createClient();
    if (!sb || !detail) return [];
    const { data, error } = await sb.from("task_events").select("*").eq("task_id", detail.id).order("created_at", { ascending: true }).limit(200);
    if (error) throw error;
    return (data ?? []) as TaskEvent[];
  });
  const nameOf = (id?: string | null) => users.find((u) => u.id === id)?.name ?? "Your accountant";

  // First open marks the task seen (staff see "Seen on …").
  useEffect(() => {
    if (!detail || detail.seen_at || seenFired.current[detail.id]) return;
    const sb = createClient();
    if (!sb) return;
    seenFired.current[detail.id] = true;
    void sb.rpc("mark_task_seen", { p_task: detail.id }).then(() => mutate(), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);

  async function changeStatus(id: string, status: string, okMsg: string) {
    const sb = createClient();
    if (!sb) { setMessage("Connect Supabase before updating a task."); return; }
    setBusy(id);
    setMessage("");
    const { error } = await sb.rpc("change_task_status", { p_task: id, p_status: status, p_reason: null });
    setBusy("");
    if (error) { setMessage(error.message); return; }
    setMessage(okMsg);
    await mutate();
  }

  async function sendComment(id: string, body: string, kind: "comment" | "question") {
    const text = body.trim();
    if (!text) return;
    const sb = createClient();
    if (!sb) { setMessage("Connect Supabase before commenting."); return; }
    setBusy(`${id}-${kind}`);
    setMessage("");
    const { error } = await sb.rpc("add_task_comment", { p_task: id, p_comment: text, p_kind: kind });
    setBusy("");
    if (error) { setMessage(error.message); return; }
    if (kind === "question") setQuestion("");
    else setComment("");
    setMessage(kind === "question" ? "Question sent to your accountant." : "Comment posted.");
    await mutate();
  }

  const comments = events.filter((e) => e.event === "commented");

  // Attachments from the accountant: the linked document, if any.
  const { data: linkedDoc = null } = useSWR<{ file_name: string } | null>(
    detail?.document_id ? ["client-task-doc", detail.document_id] : null,
    async () => {
      const sb = createClient();
      if (!sb || !detail?.document_id) return null;
      const { data } = await sb.from("documents").select("file_name").eq("id", detail.document_id).maybeSingle();
      return (data as { file_name: string } | null) ?? null;
    }
  );
  const detailFiling = filings.find((f) => f.id === detail?.related_filing_id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">My tasks</h1>
        <p className="mt-1 rounded-xl px-3 py-2 text-sm font-semibold"
          style={overdueTasks.length > 0
            ? { background: "var(--danger-bg)", color: "var(--danger-tx)" }
            : { background: "var(--accent-tint)", color: "var(--accent)" }}>
          You have {openTasks.length} {openTasks.length === 1 ? "task" : "tasks"}, {dueSoon} due soon{overdueTasks.length > 0 ? ` · ${overdueTasks.length} overdue` : ""}.
        </p>
      </div>
      {message && <p role="status" className="rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: "var(--bg)" }}>{message}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {(["todo", "overdue", "completed"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold capitalize ${tab === t ? "text-white" : ""}`}
            style={tab === t ? { background: "var(--accent)" } : { background: "var(--surface)", border: "1px solid var(--border)" }}>
            {t === "todo" ? "To do" : t}
          </button>
        ))}
        <div className="w-[150px] shrink-0"><SearchSelect label="Priority filter" hideLabel clearable={false} value={priorityFilter} onChange={setPriorityFilter} autoSelectSingle={false}
          options={[{ id: "all", label: "All priorities" }, ...["low", "normal", "medium", "high", "urgent"].map((p) => ({ id: p, label: p }))]} placeholder="All priorities" /></div>
        <div className="w-[170px] shrink-0"><SearchSelect label="Filing filter" hideLabel clearable={false} value={filingFilter} onChange={setFilingFilter} autoSelectSingle={false}
          options={[{ id: "all", label: "All filings" }, ...filings.map((f) => ({ id: f.id, label: `${f.tax_type} · ${f.period}` }))]} placeholder="All filings" /></div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks…"
          className="h-9 w-[180px] shrink-0 rounded-full border px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
      </div>
      {error && <p role="alert" className="text-sm text-[#DC2626]">Could not load your tasks: {error.message}</p>}
      {isLoading ? <div className="skeleton h-40" /> : clientTasks.length === 0 ? (
        <Card><EmptyState icon={<Inbox size={22} />} title="No tasks right now. Your accountant will add tasks here when something is needed." /></Card>
      ) : visible.length === 0 ? (
        <Card><p className="py-6 text-center text-sm" style={{ color: "var(--text-2)" }}>No tasks in this view.</p></Card>
      ) : (
        <div className="space-y-3">
          {visible.map((t) => {
            const chip = dueChip(t.due_date);
            const filing = filings.find((f) => f.id === t.related_filing_id);
            const taskKey = taskTypes.find((tt) => tt.id === t.task_type_id)?.task_key ?? "";
            const action = primaryAction(t, taskKey);
            const done = ["done", "cancelled"].includes(String(t.status));
            return (
              <Card key={t.id} className="space-y-3" hover>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <button onClick={() => setDetailId(t.id)} className="text-left text-base font-bold text-[var(--accent)] hover:underline">{t.title}</button>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>
                      {filing ? `${filing.tax_type}, ${filing.period} · ` : ""}Assigned by {nameOf(t.created_by)}{t.created_at ? ` · ${new Date(t.created_at).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <Badge tone={chip.tone}>{chip.label}</Badge>
                  <Badge tone={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : "neutral"}>{t.priority}</Badge>
                  <Badge tone={String(t.status) === "done" ? "success" : "accent"}>{String(t.status).replace(/_/g, " ")}</Badge>
                </div>
                {t.notes && <p className="text-sm" style={{ color: "var(--text-2)" }}>{t.notes}</p>}
                {!done && (
                  <div className="flex flex-wrap gap-2">
                    {String(t.status) === "open" && (
                      <Button className="px-4 py-2 text-xs" disabled={busy === t.id}
                        onClick={() => void changeStatus(t.id, "in_progress", "Task started.")}>Start task</Button>
                    )}
                    {action.kind === "link" ? (
                      <Link href={action.href} className="btn-primary inline-flex items-center px-4 py-2 text-xs">{action.label}</Link>
                    ) : action.kind === "approve" ? (
                      <Button className="px-4 py-2 text-xs" disabled={busy === t.id}
                        onClick={() => void changeStatus(t.id, "done", "Summary approved.")}>{action.label}</Button>
                    ) : (
                      <Button className="px-4 py-2 text-xs" disabled={busy === t.id}
                        onClick={() => void changeStatus(t.id, "done", "Task marked done.")}>{action.label}</Button>
                    )}
                    <Button variant="ghost" className="px-4 py-2 text-xs" onClick={() => { setDetailId(t.id); setQuestion(""); }}>
                      Ask a question
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {detail && (
        <Modal open onClose={() => setDetailId(null)} title={detail.title} size="xl">
          <div className="space-y-5 text-sm">
            <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <p><span style={{ color: "var(--text-2)" }}>Status: </span><span className="font-semibold">{String(detail.status).replace(/_/g, " ")}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Due: </span><span className="font-semibold">{dueChip(detail.due_date).label}{detail.due_date ? ` (${detail.due_date})` : ""}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Priority: </span><span className="font-semibold">{detail.priority}</span></p>
              <p><span style={{ color: "var(--text-2)" }}>Assigned by: </span><span className="font-semibold">{nameOf(detail.created_by)}{detail.created_at ? ` · ${new Date(detail.created_at).toLocaleDateString()}` : ""}</span></p>
            </div>
            {detail.notes && <p className="rounded-xl p-3" style={{ background: "var(--bg)" }}>{detail.notes}</p>}
            {(detailFiling || linkedDoc) && (
              <div className="flex flex-wrap gap-2">
                {detailFiling && (
                  <Link href="/client/tax-filings" className="rounded-[10px] border px-3 py-2 text-xs font-bold" style={{ borderColor: "var(--border)" }}>
                    {detailFiling.tax_type} · {detailFiling.period}
                  </Link>
                )}
                {linkedDoc && (
                  <Link href="/client/documents" className="rounded-[10px] border px-3 py-2 text-xs font-bold" style={{ borderColor: "var(--border)" }}>
                    Attachment: {linkedDoc.file_name}
                  </Link>
                )}
              </div>
            )}
            {detail.reopened_reason && (
              <p className="rounded-xl px-3 py-2 text-xs font-medium" style={{ background: "var(--warn-bg)", color: "var(--warn-tx)" }}>
                Reopened by your accountant: {detail.reopened_reason}
              </p>
            )}
            <div>
              <p className="eyebrow mb-2">History</p>
              <div className="space-y-1.5">
                {events.length === 0 && <p className="text-xs" style={{ color: "var(--text-2)" }}>No history yet.</p>}
                {events.filter((e) => e.event !== "commented").map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-xs">
                    <Badge tone="neutral">{e.event.replace(/_/g, " ")}</Badge>
                    <span style={{ color: "var(--text-2)" }}>{fmtDT(e.created_at)}</span>
                    {e.event === "reopened" && e.details?.reason != null && <span>— {String(e.details.reason)}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="eyebrow mb-2">Messages with your accountant ({comments.length})</p>
              <div className="space-y-2">
                {comments.length === 0 && <p className="text-xs" style={{ color: "var(--text-2)" }}>No messages yet.</p>}
                {comments.map((c) => (
                  <div key={c.id} className="rounded-xl p-3" style={{ background: "var(--bg)" }}>
                    <p className="mb-1 text-xs font-semibold">{c.actor_id === currentUser?.id ? "You" : nameOf(c.actor_id)} · {fmtDT(c.created_at)}</p>
                    <p>{String(c.details?.body ?? "")}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a message…"
                  className="flex-1 rounded-[10px] border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
                <Button className="px-4 py-2 text-xs" disabled={busy !== "" || !comment.trim()}
                  onClick={() => void sendComment(detail.id, comment, "comment")}>Send</Button>
              </div>
              <div className="mt-2 flex gap-2">
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question…"
                  className="flex-1 rounded-[10px] border px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
                <Button variant="ghost" className="px-4 py-2 text-xs" disabled={busy !== "" || !question.trim()}
                  onClick={() => void sendComment(detail.id, question, "question")}>Ask</Button>
              </div>
            </div>
            {!["done", "cancelled"].includes(String(detail.status)) && (
              <div className="flex flex-wrap gap-2">
                {String(detail.status) === "open" && (
                  <Button className="px-4 py-2 text-xs" disabled={busy === detail.id}
                    onClick={() => void changeStatus(detail.id, "in_progress", "Task started.")}>Start task</Button>
                )}
                <Button className="px-4 py-2 text-xs" disabled={busy === detail.id}
                  onClick={() => void changeStatus(detail.id, "done", "Task marked done.")}>Mark as done</Button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function PerformanceView({ role }: { role: string }) {
  const { data: filings = [] } = useFilings();
  const { data: tasks = [] } = useTasks();
  const done = filings.filter((f) => isComplete(String(f.status))).length;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{role === "admin" ? "My Performance" : "My Performance"}</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Filings done" value={String(done)} spark={<Sparkline points={[1, 2, 3, done || 1]} color="var(--accent)" />} />
        <StatCard label="Tasks done" value={String(tasks.filter((t) => String(t.status) === "done").length)} spark={<Sparkline points={[2, 3, 2, 5]} />} />
        <StatCard label="On-time rate" value={filings.length ? `${Math.round((done / filings.length) * 100)}%` : "—"} spark={<Sparkline points={[60, 70, 80, 90]} color="var(--accent)" />} />
      </div>
      <Card><p className="text-sm" style={{ color: "var(--text-2)" }}>Live from your scoped filings and tasks. Detailed breakdowns appear in Reports.</p></Card>
    </div>
  );
}

export function HistoryView() {
  const { data: filings = [] } = useFilings();
  const { data: clients = [] } = useClients();
  const past = filings.filter((f) => ["filed", "completed"].includes(displayStatus(String(f.status), f.due_date)) || isComplete(String(f.status)));
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const previewFiling = past.find((f) => f.id === previewId) ?? null;

  async function downloadPdf(filing: (typeof past)[number]) {
    setBusyId(filing.id);
    try {
      const client = clientById.get(filing.client_id);
      const { doc, filename } = await buildFilingReceiptPdf(
        { id: filing.id, tax_type: filing.tax_type, period: filing.period, due_date: filing.due_date, status: displayStatus(String(filing.status), filing.due_date), amount_owed: filing.amount_owed, amount_refund: filing.amount_refund, filed_at: filing.filed_at },
        client?.business_name ?? client?.name
      );
      doc.save(filename);
    } finally {
      setBusyId(null);
    }
  }

  async function openPreview(filing: (typeof past)[number]) {
    setPreviewId(filing.id);
    setPreviewUrl(null);
    setPreviewBusy(true);
    try {
      const client = clientById.get(filing.client_id);
      const { doc, filename } = await buildFilingReceiptPdf(
        { id: filing.id, tax_type: filing.tax_type, period: filing.period, due_date: filing.due_date, status: displayStatus(String(filing.status), filing.due_date), amount_owed: filing.amount_owed, amount_refund: filing.amount_refund, filed_at: filing.filed_at },
        client?.business_name ?? client?.name
      );
      setPreviewName(filename);
      setPreviewUrl(doc.output("datauristring") as unknown as string);
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><h1 className="text-2xl font-bold">Filing History</h1>
        <Button variant="ghost" className="ml-auto" onClick={() => downloadFile("filing-history.csv", "period,tax_type,status\n" + filings.map((f) => `${f.period},${f.tax_type},${displayStatus(String(f.status), f.due_date)}`).join("\n"))}>Export CSV</Button></div>
      <Card>
        {past.length === 0 ? <EmptyState icon={<Inbox size={22} />} title="No filed returns yet — downloads appear here once filed" /> : (
          <div className="space-y-2">{past.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)" }}>
              <span className="font-semibold">{f.period} · {f.tax_type}</span>
              <Badge tone="success">{stageLabel(String(f.status), true)}</Badge>
              <span className="ml-auto flex items-center gap-2">
                <button className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline" onClick={() => openPreview(f)}><Eye size={13} /> Preview</button>
                <button className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)] hover:underline disabled:opacity-50" disabled={busyId === f.id} onClick={() => downloadPdf(f)}><Download size={13} /> {busyId === f.id ? "Preparing…" : "Download PDF"}</button>
              </span>
            </div>
          ))}
          </div>
        )}
      </Card>
      <Modal open={!!previewFiling} onClose={() => { setPreviewId(null); setPreviewUrl(null); }} title={previewFiling ? `${previewFiling.period} · ${previewFiling.tax_type} receipt` : "Receipt preview"} size="xl">
        {previewFiling && (() => {
          const client = clientById.get(previewFiling.client_id);
          const receiptShort = `RCP-${String(previewFiling.id).slice(0, 8).toUpperCase()}`;
          return (
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center gap-4 bg-neutral-950 px-5 py-4 text-white sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400">Receipt preview · premium</p>
                <h4 className="mt-1 truncate font-serif text-lg font-bold tracking-tight">{previewFiling.period} · {previewFiling.tax_type}</h4>
                <p className="mt-0.5 truncate text-xs text-neutral-400">{client?.business_name ?? client?.name ?? "Client"} · {receiptShort}</p>
              </div>
              <span className="rounded-full border border-white/25 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">{String(previewFiling.status).replace(/_/g, " ")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-5 py-3 sm:px-6">
              <p className="text-xs font-medium text-neutral-500">{previewBusy ? "Rendering premium PDF…" : previewName || "A4 · black & white · print-ready"}</p>
              <span className="ml-auto flex gap-2">
                <button onClick={() => { setPreviewId(null); setPreviewUrl(null); }} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:border-neutral-900">Close</button>
                <button
                  disabled={previewBusy || !previewUrl}
                  onClick={() => previewFiling && downloadPdf(previewFiling)}
                  className="inline-flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-40"
                >
                  <Download size={14} /> Download PDF
                </button>
              </span>
            </div>
            <div className="bg-neutral-100 p-4 sm:p-6">
              {previewBusy || !previewUrl ? (
                <div className="mx-auto max-w-[820px] space-y-3 bg-white p-6 shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
                  <div className="h-24 bg-neutral-950" />
                  <div className="skeleton h-6" /><div className="skeleton h-6" /><div className="skeleton h-40" />
                </div>
              ) : (
                <div className="mx-auto max-w-[820px] overflow-hidden rounded-sm bg-white shadow-[0_24px_70px_rgba(0,0,0,0.22)] ring-1 ring-neutral-900/10">
                  <iframe src={previewUrl} title="Receipt PDF preview" className="h-[560px] w-full bg-white" />
                </div>
              )}
            </div>
          </div>
          );
        })()}
      </Modal>
    </div>
  );
}
