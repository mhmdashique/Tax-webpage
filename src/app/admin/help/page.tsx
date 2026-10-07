"use client";
import { SimplePage } from "@/components/entities";
import { TicketHelpCenter } from "@/components/tickets";

export default function P() {
  return (
    <div className="space-y-5">
      <SimplePage title="Help & Support" sub="All employee and client tickets — triage, assign, reply and close. Email support@taxdesk.io for help." />
      <TicketHelpCenter role="admin" />
    </div>
  );
}
