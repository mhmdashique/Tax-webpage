-- 0002: filing lifecycle (created → documents_requested → documents_received →
-- in_preparation → client_review → filed → completed; overdue = past-due flag).
-- Status stays free-text for forward compat; old v1 values are backfilled.
-- Overdue is derived (due_date passed AND status not in filed/completed) but also
-- materialized by the daily-sweep cron for dashboard red flags + notifications.

update filings set status = 'created' where status = 'pending';
update filings set status = 'in_preparation' where status = 'in_progress';
update filings set status = 'client_review' where status = 'in_review';

-- filed_at is recorded at stage 6 (filed); completed closes on payment receipt.
-- fee invoice generation on filed + receipt availability on completed are app-level
-- side effects (see src/components/entities.tsx advance() + src/lib/lifecycle.ts).

-- Access rules recap (enforced in 0001 RLS, unchanged):
-- admin: all firm data · employee: assigned clients only (+ read-only workload context)
--        client: own linked rows only · e-sign: client only.
