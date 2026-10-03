-- =====================================================================
-- 0010: confirm every existing auth user (email verification is removed;
-- admin approval is the only gate). New sign-ups are created pre-confirmed
-- by /api/auth/signup, so this is a one-time backfill for accounts created
-- under the old verification flow — nobody stays locked out.
--
-- If this fails on hosted Supabase, run the UPDATE below manually in the
-- SQL Editor (same statement, same effect).
-- =====================================================================

update auth.users
   set email_confirmed_at = coalesce(email_confirmed_at, now()),
       updated_at = now()
 where email_confirmed_at is null;
