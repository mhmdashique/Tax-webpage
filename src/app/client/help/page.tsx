"use client";
import Link from "next/link";
import { LifeBuoy, MessagesSquare } from "lucide-react";
import { PremiumHead, ClientHelpFaqs } from "@/components/client-premium";
import { TicketHelpCenter } from "@/components/tickets";
import { Card } from "@/components/ui";

const GREEN = "var(--accent)";

export default function P() {
  return (
    <div className="client-enter space-y-5">
      {/* Hero header on top of the support tickets section */}
      <PremiumHead
        eyebrow="Support"
        title="Help & support"
        sub="Plain-language guides for uploading, signing and paying — same clean layout as every client page."
        actions={<span className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold" style={{ background: "var(--accent-tint)", color: "var(--accent)" }}><LifeBuoy size={14} /> Support centre</span>}
      />
      {/* One box, two panels: contact strip + tickets */}
      <Card>
        <div className="space-y-4">
          {/* Box 1 — contact */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Still stuck?</p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-2)" }}>Message your accountant directly — median reply time is under a day.</p>
            </div>
            <Link href="/client/messages" className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white" style={{ background: GREEN }}>
              <MessagesSquare size={14} /> Open messages
            </Link>
          </div>
          {/* Box 2 — tickets */}
          <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <TicketHelpCenter role="client" framed={false} />
          </div>
        </div>
      </Card>
      {/* Guides below the ticket section */}
      <Card>
        <h3 className="mb-1 text-base font-bold">Guides</h3>
        <p className="mb-4 text-xs" style={{ color: "var(--text-2)" }}>Quick answers for everyday tasks</p>
        <ClientHelpFaqs />
      </Card>
    </div>
  );
}
