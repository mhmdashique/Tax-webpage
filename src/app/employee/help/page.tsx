"use client";
import { SimplePage } from "@/components/entities";
import { TicketHelpCenter } from "@/components/tickets";

export default function P() {
  return (
    <div className="space-y-5">
      <SimplePage title="Help & Support" sub="Guides and support contact for employees. Raise internal tickets below — only you and admins can see them." />
      <TicketHelpCenter role="employee" />
    </div>
  );
}
