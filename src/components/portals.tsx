"use client";
import { useRef, useState } from "react";
import { Card, Button, EmptyState, Badge, StatCard, Stepper, Sparkline } from "./ui";
import { useFilings, useTasks, useDocuments, useClients, useCurrentUser } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/client";
import { dueLabel, greeting, formatMoney, downloadFile } from "@/lib/data";
import Link from "next/link";
import { Upload, FileSignature, User as UserIcon, Bell, Palette, Briefcase, CalendarDays, Inbox } from "lucide-react";
import { SecurityCard } from "./reports-settings";
import { CLIENT_STEPPER, clientStepperIndex, stageLabel, clientActionFor, isComplete, isOverdue, displayStatus, FILING_STAGES } from "@/lib/lifecycle";

export function AccountView({ role }: { role: "employee" | "client" | "admin" }) {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState({ name: role === "client" ? "Acme Ltd" : "Jonas Lee", phone: "", title: "", dept: "", business: "Acme Ltd", entity: "LLC", taxId: "", address: "" });
  const [prefs, setPrefs] = useState({ theme: "system", lang: "en", tz: "UTC" });
  const [notifs, setNotifs] = useState({ email_overdue: true, inapp_bell: true });
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Signature state
  const [typed, setTyped] = useState("");
  const [mode, setMode] = useState<"type" | "draw">("type");
  const [history, setHistory] = useState<{ name: string; at: string }[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function flash() { setSaved(true); setTimeout(() => setSaved(false), 2000); }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const sb = createClient();
    if (!sb) { flash(); return; }
    const path = `avatars/${Date.now()}-${f.name}`;
    await sb.storage.from("avatars").upload(path, f);
    flash();
  }

  function saveSignature() {
    if (!typed.trim() && mode === "type") return;
    const name = mode === "type" ? typed : "drawn-signature";
    setHistory([{ name, at: new Date().toISOString() }, ...history]);
    flash();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{role === "client" ? "Account & Profile" : "Account & Profile"}</h1>
      {saved && <p className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "var(--success-bg)", color: "var(--success-tx)" }}>Saved successfully</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white" style={{ background: "#2563EB", boxShadow: "0 0 0 4px #2563EB33" }}>
            {profile.name.slice(0, 1)}
          </div>
          <p className="font-semibold">{profile.name}</p>
          <button className="btn-ghost px-4 py-2 text-sm" onClick={() => fileRef.current?.click()}>Upload photo</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
          <p className="text-xs" style={{ color: "var(--text-2)" }}>Stored in Supabase Storage · avatars bucket</p>
        </Card>
        <div className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap gap-2">
            {["profile", "security", "notifications", "preferences", ...(role === "client" ? ["signature"] : ["work"])].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-xs font-semibold capitalize ${tab === t ? "text-white" : ""}`}
                style={tab === t ? { background: "#2563EB" } : { border: "1px solid var(--border)" }}>{t}</button>
            ))}
          </div>
          {tab === "profile" && (
            <Card>
              <div className="grid gap-3">
                <label className="text-sm">Full name<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} /></label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">Phone<input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} /></label>
                  <label className="text-sm">Job title<input value={profile.title} onChange={(e) => setProfile({ ...profile, title: e.target.value })} className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} /></label>
                </div>
                {role === "client" ? (
                  <>
                    <button className="btn-ghost w-fit px-4 py-2 text-sm font-bold">Edit</button>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm">Business name<input value={profile.business} onChange={(e) => setProfile({ ...profile, business: e.target.value })} className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} /></label>
                      <label className="text-sm">Entity type<input value={profile.entity} onChange={(e) => setProfile({ ...profile, entity: e.target.value })} className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} /></label>
                      <label className="text-sm">Tax ID<input value={profile.taxId} onChange={(e) => setProfile({ ...profile, taxId: e.target.value })} className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} /></label>
                      <label className="text-sm">Address<input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} /></label>
                    </div>
                  </>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm">Department<input value={profile.dept} onChange={(e) => setProfile({ ...profile, dept: e.target.value })} className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} /></label>
                  </div>
                )}
                <Button className="w-fit px-6" onClick={async () => { const sb = createClient(); if (sb) await sb.from("users").update({ name: profile.name, phone: profile.phone }).eq("email", "demo@taxdesk.io"); flash(); }}>Save changes</Button>
              </div>
            </Card>
          )}
          {tab === "security" && <SecurityCard />}
          {tab === "notifications" && (
            <Card>
              {(Object.keys(notifs) as (keyof typeof notifs)[]).map((k) => (
                <label key={k} className="flex items-center gap-3 border-t py-3 text-sm first:border-0" style={{ borderColor: "var(--border)" }}>
                  <input type="checkbox" checked={notifs[k]} onChange={() => { setNotifs({ ...notifs, [k]: !notifs[k] }); flash(); }} /> {k.replace(/_/g, " ")}
                </label>
              ))}
            </Card>
          )}
          {tab === "preferences" && (
            <Card>
              <div className="grid gap-3">
                {(Object.keys(prefs) as (keyof typeof prefs)[]).map((k) => (
                  <label key={k} className="text-sm capitalize">{k}<input value={prefs[k]} onChange={(e) => { setPrefs({ ...prefs, [k]: e.target.value }); }} className="mt-1 w-full rounded-[10px] border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} /></label>
                ))}
                <Button className="w-fit px-6" onClick={flash}>Save preferences</Button>
              </div>
            </Card>
          )}
          {tab === "signature" && (
            <Card>
              <h3 className="font-semibold">e-Signature</h3>
              <div className="mt-2 flex gap-2">
                {(["type", "draw"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize ${mode === m ? "text-white" : ""}`} style={mode === m ? { background: "#2563EB" } : { border: "1px solid var(--border)" }}>{m}</button>)}
              </div>
              {mode === "type" ? (
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your full name to sign" className="mt-3 w-full rounded-[10px] border px-3 py-3 font-serif text-xl italic" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
              ) : (
                <canvas ref={canvasRef} width={500} height={160} className="mt-3 w-full cursor-crosshair rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg)" }}
                  onMouseDown={() => (drawing.current = true)} onMouseUp={() => (drawing.current = false)}
                  onMouseMove={(e) => {
                    if (!drawing.current || !canvasRef.current) return;
                    const ctx = canvasRef.current.getContext("2d");
                    if (!ctx) return;
                    const r = canvasRef.current.getBoundingClientRect();
                    ctx.fillStyle = "#111";
                    ctx.beginPath();
                    ctx.arc(e.clientX - r.left, e.clientY - r.top, 1.6, 0, 7);
                    ctx.fill();
                  }} />
              )}
              <div className="mt-3 flex gap-2">
                <Button onClick={saveSignature}>Save signature</Button>
                <Button variant="ghost" onClick={() => { setTyped(""); const c = canvasRef.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); }}>Clear</Button>
              </div>
              <div className="mt-4">
                <p className="eyebrow mb-2">Signature history (audit log)</p>
                {history.length === 0 ? <p className="text-sm" style={{ color: "var(--text-2)" }}>No signatures yet — saved signatures with timestamps appear here.</p> : (
                  <div className="space-y-2">{history.map((h, i) => <div key={i} className="flex justify-between rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}><span className="font-serif italic">{h.name}</span><span className="text-xs" style={{ color: "var(--text-2)" }}>{new Date(h.at).toLocaleString()}</span></div>)}</div>
                )}
              </div>
            </Card>
          )}
          {tab === "work" && <WorkSummary />}
        </div>
      </div>
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
      <p className="text-sm" style={{ color: "var(--text-2)" }}>{done} tasks done · {filedDone} filings completed · {filings.length} in scope. <Link href="/employee/performance" className="font-semibold text-[#2563EB] hover:underline">Open My Performance</Link></p>
    </Card>
  );
}

export function EmployeeDashboard() {
  const { data: currentUser } = useCurrentUser();
  const { data: filings = [], isLoading } = useFilings();
  const { data: clients = [] } = useClients();
  const { data: tasks = [] } = useTasks();
  const open = tasks.filter((t) => String(t.status) !== "done").length;
  const dueWeek = filings.filter((f) => { const d = new Date(f.due_date).getTime() - Date.now(); return d >= 0 && d < 7 * 864e5; }).length;
  const doneMonth = filings.filter((f) => isComplete(String(f.status))).length;
  const sorted = [...filings].sort((a, b) => +new Date(a.due_date) - +new Date(b.due_date)).slice(0, 6);
  const userName = currentUser?.name ?? "User";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 text-white" style={{ background: "linear-gradient(135deg,#0EA5A4,#2563EB)", boxShadow: "0 8px 30px #0EA5A422" }}>
        <h1 className="text-2xl font-bold">{greeting()}, {userName}</h1>
        <p className="mt-1 text-sm opacity-90">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {dueWeek} filings due this week</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My clients" value={String(clients.length)} icon={<UserIcon size={18} />} spark={<Sparkline points={[2, 3, 4, 5, clients.length || 1]} color="#0EA5A4" />} />
        <StatCard label="Open tasks" value={String(open)} icon={<Briefcase size={18} />} spark={<Sparkline points={[5, 4, 6, 3, open || 1]} />} />
        <StatCard label="Due this week" value={String(dueWeek)} icon={<CalendarDays size={18} />} spark={<Sparkline points={[1, 2, 1, 3, dueWeek]} color="#D97706" />} />
        <StatCard label="Completed month" value={String(doneMonth)} icon={<Briefcase size={18} />} spark={<Sparkline points={[1, 2, 3, 4, doneMonth]} color="#16A34A" />} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">My Clients</h2><Link href="/employee/clients" className="text-sm font-semibold text-[#2563EB] hover:underline">View all</Link></div>
          {clients.length === 0 ? <EmptyState icon={<UserIcon size={22} />} title="No clients assigned to you yet" /> : (
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
    </div>
  );
}

export function ClientDashboard() {
  const { data: currentUser } = useCurrentUser();
  const { data: filings = [], isLoading } = useFilings();
  const { data: docs = [] } = useDocuments();
  const { data: tasks = [] } = useTasks();
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
      <div className="rounded-2xl p-6 text-white md:p-8" style={{ background: "linear-gradient(135deg,#6366F1,#2563EB)", boxShadow: "0 8px 30px #6366F122" }}>
        <div className="flex flex-wrap items-center gap-3">
          <div><h1 className="text-2xl font-bold">Welcome, {userName}</h1><p className="mt-1 text-sm opacity-85">Tax year 2026 · plain-language status below</p></div>
          <div className="ml-auto flex gap-2">
            <Link href="/client/documents" className="rounded-[10px] bg-white px-4 py-2.5 text-sm font-semibold text-[#1D4ED8]"><Upload size={14} className="mr-1 inline" /> Upload docs</Link>
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
              {action && !overdue && <span> · next: <Link href={action.includes("upload") ? "/client/documents" : action.includes("sign") ? "/client/account" : "/client/payments"} className="font-bold text-[#2563EB] hover:underline">{action}</Link></span>}
            </p>
          </>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Upcoming deadlines" value={String(filings.filter((f) => !isComplete(String(f.status))).length)} icon={<CalendarDays size={18} />} />
        <StatCard label="Action items" value={String(filingActions.length + tasks.filter((t) => String(t.status) !== "done").length)} icon={<Bell size={18} />} />
        <StatCard label="Tax summary" value={!filing ? "—" : formatMoney(Number((filing as { amount_owed?: number }).amount_owed ?? 0))} icon={<Palette size={18} />} />
        <StatCard label="Documents" value={String((docs as unknown[]).length)} icon={<Upload size={18} />} spark={<Sparkline points={[1, 2, 3, (docs as unknown[]).length || 1]} color="#6366F1" />} />
      </div>

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
          {filingActions.length === 0 && tasks.filter((t) => String(t.status) !== "done").length === 0 ? <EmptyState icon={<Inbox size={22} />} title="All caught up — nothing needs your action" /> : (
            <div className="space-y-2">
              {filingActions.slice(0, 5).map(({ filing: f, action: a }) => (
                <div key={f.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)" }}>
                  <span className="font-medium">{f.tax_type} {f.period}: {a}</span>
                  <Link href={a!.includes("upload") ? "/client/documents" : a!.includes("sign") ? "/client/account" : "/client/payments"} className="ml-auto text-xs font-bold text-[#2563EB] hover:underline">Do it now</Link>
                </div>
              ))}
              {tasks.filter((t) => String(t.status) !== "done").slice(0, 5).map((t) => (
                <label key={t.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)" }}>
                  <input type="checkbox" /> <span className="font-medium">{t.title}</span>
                  <Link href="/client/documents" className="ml-auto text-xs font-bold text-[#2563EB] hover:underline">Do it now</Link>
                </label>
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

export function PerformanceView({ role }: { role: string }) {
  const { data: filings = [] } = useFilings();
  const { data: tasks = [] } = useTasks();
  const done = filings.filter((f) => isComplete(String(f.status))).length;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{role === "admin" ? "My Performance" : "My Performance"}</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Filings done" value={String(done)} spark={<Sparkline points={[1, 2, 3, done || 1]} color="#16A34A" />} />
        <StatCard label="Tasks done" value={String(tasks.filter((t) => String(t.status) === "done").length)} spark={<Sparkline points={[2, 3, 2, 5]} />} />
        <StatCard label="On-time rate" value={filings.length ? `${Math.round((done / filings.length) * 100)}%` : "—"} spark={<Sparkline points={[60, 70, 80, 90]} color="#16A34A" />} />
      </div>
      <Card><p className="text-sm" style={{ color: "var(--text-2)" }}>Live from your scoped filings and tasks. Detailed breakdowns appear in Reports.</p></Card>
    </div>
  );
}

export function HistoryView() {
  const { data: filings = [] } = useFilings();
  const past = filings.filter((f) => ["filed", "completed"].includes(displayStatus(String(f.status), f.due_date)) || isComplete(String(f.status)));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><h1 className="text-2xl font-bold">Filing History</h1>
        <Button variant="ghost" className="ml-auto" onClick={() => downloadFile("filing-history.csv", "period,tax_type,status\n" + filings.map((f) => `${f.period},${f.tax_type},${displayStatus(String(f.status), f.due_date)}`).join("\n"))}>Export CSV</Button></div>
      <Card>
        {past.length === 0 ? <EmptyState icon={<Inbox size={22} />} title="No filed returns yet — downloads appear here once filed" /> : (
          <div className="space-y-2">{past.map((f) => <div key={f.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)" }}><span className="font-semibold">{f.period} · {f.tax_type}</span><Badge tone="success">{stageLabel(String(f.status), true)}</Badge><button className="ml-auto text-xs font-bold text-[#2563EB] hover:underline" onClick={() => downloadFile(`${f.period}-${f.tax_type}-receipt.txt`, `Receipt for ${f.tax_type} ${f.period}\nStatus: ${displayStatus(String(f.status), f.due_date)}\nOwed: ${f.amount_owed ?? 0}`)}>Download receipt</button></div>)}
          </div>
        )}
      </Card>
    </div>
  );
}
