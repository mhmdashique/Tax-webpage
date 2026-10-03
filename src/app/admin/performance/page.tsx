"use client";
import { PerformanceView } from "@/components/portals";
import { PendingApprovalsCard } from "@/components/approvals";

export default function P() {
  return (
    <div className="space-y-4">
      <PendingApprovalsCard />
      <PerformanceView role="admin" />
    </div>
  );
}
