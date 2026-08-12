-- =============================================================================
-- Migration: row level security: enable RLS, drop every legacy policy name, create the final hardened policy set
--
-- This is an ordered, verbatim slice of db/schema.sql (the canonical full
-- snapshot — see db/README.md for how these two are kept in sync and which
-- one to run). Every statement here is idempotent and safe to re-run.
-- =============================================================================

-- =============================================================================
-- 13. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worksheet_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ── C05/C07: drop every policy name that has EVER existed anywhere in this
-- repo's history (across all four tables), so the final CREATE POLICY set
-- below always wins outright — no name-mismatch can leave a stale permissive
-- policy alive alongside the hardened one. DROP POLICY IF EXISTS is a no-op
-- when the name never existed on that table, so this is always safe.
DO $$
DECLARE
  tbl text;
  pol text;
  legacy_policies text[] := ARRAY[
    'Admin read all profiles', 'Admin update profiles',
    'Allow anon profile insert', 'Allow profile insert',
    'Insert notifications', 'Insert own profile', 'Insert own submissions',
    'Leads can read all profiles', 'Read worksheet access',
    'Reviewers can update submissions', 'Reviewers can update worksheets',
    'Reviewers select submissions', 'Reviewers update submissions',
    'Buddy update submissions', 'Manager update submissions',
    'Select own notifications', 'Select own profile', 'Select own submissions',
    'Update own notifications', 'Update own profile', 'Update own submissions',
    'Users can insert notifications', 'Users can insert own submissions',
    'Users can insert own worksheets', 'Users can read own notifications',
    'Users can read own profile', 'Users can read own submissions',
    'Users can update own notifications', 'Users can update own profile',
    'Users can update own submissions', 'Users can update own worksheets'
  ];
  tables text[] := ARRAY['user_profiles', 'onboarding_submissions', 'worksheet_submissions', 'notifications'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOREACH pol IN ARRAY legacy_policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END LOOP;
  END LOOP;
END $$;

-- ── user_profiles ───────────────────────────────────────────────────────────

CREATE POLICY "Select own profile" ON public.user_profiles
  FOR SELECT USING (id = auth.uid());

-- Signup: client never supplies a role (INSERT policy doesn't reference role
-- at all — handle_new_user is what actually creates the row; this exists for
-- any legitimate client-side profile-completion insert, e.g. OAuth flows).
CREATE POLICY "Insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- C05/C04: the ONLY self-update policy. A user may update their own row but
-- can never change their own role unless they are already academic_head.
CREATE POLICY "Update own profile" ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      role = (SELECT p.role FROM public.user_profiles p WHERE p.id = user_profiles.id)
      OR public.get_user_role() = 'academic_head'
    )
  );

CREATE POLICY "Admin read all profiles" ON public.user_profiles
  FOR SELECT USING (
    public.get_user_role() IN ('academic_head', 'lead_instructor', 'onboarding_lead')
  );

-- H12/M07: admin-on-others updates (e.g. AssignmentsTab assigning
-- leads/buddies). Role can never be changed through this policy — role
-- changes only ever happen via promote_user_if_eligible() or the row owner
-- (academic_head only) above.
CREATE POLICY "Admin update profiles" ON public.user_profiles
  FOR UPDATE
  USING (public.get_user_role() IN ('academic_head', 'lead_instructor', 'onboarding_lead'))
  WITH CHECK (
    public.get_user_role() IN ('academic_head', 'lead_instructor', 'onboarding_lead')
    AND role = (SELECT p.role FROM public.user_profiles p WHERE p.id = user_profiles.id)
  );

-- ── onboarding_submissions (legacy assessment table) ────────────────────────

CREATE POLICY "Users can read own submissions" ON public.onboarding_submissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.get_user_role() IN ('academic_head', 'lead_instructor', 'onboarding_lead')
  );

CREATE POLICY "Users can insert own submissions" ON public.onboarding_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own submissions" ON public.onboarding_submissions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── worksheet_submissions ────────────────────────────────────────────────────

CREATE POLICY "Select own submissions" ON public.worksheet_submissions
  FOR SELECT USING (auth.uid() = user_id);

-- C02/H13: first-time insert may only start a submission in a draft or
-- pending-review state, and can never carry reviewer-identity fields.
CREATE POLICY "Insert own submissions" ON public.worksheet_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND review_status IN ('', 'pending_review', 'revision_submitted') -- resubmit: owner upserts revision_submitted in the revision round-trip
    AND reviewed_by IS NULL
  );

-- C02/C05/H13/H24: ownership only here. Deliberately NOT re-validating
-- review_status transition legality with a self-correlated subquery — doing
-- so (WHERE ws.id = worksheet_submissions.id) trips Postgres's RLS
-- infinite-recursion guard, unlike the non-correlated auth.uid()-keyed
-- subquery used for user_profiles.role above. validate_review_transition()
-- (a BEFORE UPDATE trigger, which has clean OLD/NEW access with no recursion
-- risk) is the sole and authoritative enforcement of which review_status
-- transitions the owner may make, including blocking any change at all once
-- a reviewer has acted (H15/H24) while still allowing a routine autosave
-- that leaves an already-reviewed review_status untouched. The column CHECK
-- constraint additionally bounds review_status to its legal enum domain.
CREATE POLICY "Update own submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Broad read access for all reviewer roles (incl. onboarding_lead, which is
-- SELECT-only — H03/H24) plus the assigned buddy/manager for a given joinee.
CREATE POLICY "Reviewers select submissions" ON public.worksheet_submissions
  FOR SELECT USING (
    public.get_user_role() IN ('lead_instructor', 'academic_head', 'onboarding_lead')
    OR auth.uid() = user_id
    OR auth.uid() IN (SELECT assigned_lead_id FROM public.user_profiles WHERE id = worksheet_submissions.user_id)
    OR auth.uid() IN (SELECT assigned_buddy_id FROM public.user_profiles WHERE id = worksheet_submissions.user_id)
  );

-- H03/H24: buddy may only act on their assigned joinees (or any joinee left
-- unassigned, matching the app's existing "no buddy assigned yet" fallback).
-- WHICH transitions are legal is enforced by validate_review_transition().
CREATE POLICY "Buddy update submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (
    public.get_user_role() = 'lead_instructor'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_buddy_id = auth.uid() OR up.assigned_buddy_id IS NULL)
    )
  )
  WITH CHECK (
    public.get_user_role() = 'lead_instructor'
    AND review_status IN ('buddy_approved', 'needs_revision')
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_buddy_id = auth.uid() OR up.assigned_buddy_id IS NULL)
    )
  );

-- H03/H24: manager may only act on their assigned joinees (or unassigned),
-- and only to move a buddy-approved worksheet to fully approved.
CREATE POLICY "Manager update submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (
    public.get_user_role() = 'academic_head'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_lead_id = auth.uid() OR up.assigned_lead_id IS NULL)
    )
  )
  WITH CHECK (
    public.get_user_role() = 'academic_head'
    AND review_status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_lead_id = auth.uid() OR up.assigned_lead_id IS NULL)
    )
  );

-- NOTE: onboarding_lead intentionally has NO update policy on
-- worksheet_submissions (H03/H24 — read-only monitoring role only).

-- ── notifications ────────────────────────────────────────────────────────────

CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

-- Contract item 5: almost all notifications are now created server-side
-- (SECURITY DEFINER triggers/RPC bypass RLS entirely). The only remaining
-- legitimate client-side insert is a user notifying themselves; reviewers no
-- longer get a blanket "insert to anyone" allowance (that was a
-- privilege-escalation / phishing vector — a "reviewer" could otherwise spam
-- forged notifications to any user).
CREATE POLICY "Users can insert notifications" ON public.notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
