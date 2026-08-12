-- =============================================================================
-- FIX (BUG-1/BUG-2): Re-apply the canonical worksheet review state-machine
-- trigger. The live DB was found running a divergent, weaker trigger whose
-- error text ("Invalid review_status transition") exists in NO migration file,
-- allowing the submission owner to self-approve and managers to approve without
-- a buddy step. This file restores the canonical trigger defined in
-- 20260710000003_review_state_machine.sql (verbatim, idempotent — safe to
-- re-run; service-role/admin updates with auth.uid() IS NULL pass through).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_review_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_role text;
  is_owner boolean;
  status_changed boolean;
  actor_name text;
BEGIN
  -- Trusted server-side contexts (service_role / SQL editor / seed scripts)
  -- have no JWT and therefore no auth.uid(); let them through unchanged so
  -- seeding and admin operations are not blocked by this trigger.
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  actor_role := public.get_user_role();
  is_owner := (actor = OLD.user_id);
  status_changed := (NEW.review_status IS DISTINCT FROM OLD.review_status);

  -- H15: the row owner can never rewrite reviewer-identity columns, no matter
  -- what the client sends (autosave upserts, forged form-state keys, etc).
  IF is_owner THEN
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.reviewer_name := OLD.reviewer_name;
  END IF;

  -- review_history is append-only and server-written. Never trust the
  -- client's copy — always start from what is already persisted.
  NEW.review_history := OLD.review_history;

  IF NOT status_changed THEN
    RETURN NEW;
  END IF;

  IF is_owner THEN
    -- C02/H13/H24: once a reviewer has acted (buddy_approved/approved), the
    -- owner can never mutate review_status again — not even to '' or
    -- 'pending_review', both otherwise-legal owner values.
    IF OLD.review_status IN ('buddy_approved', 'approved') THEN
      RAISE EXCEPTION 'This worksheet has already been reviewed and can no longer be changed by its owner';
    END IF;
    -- Otherwise the owner may only ever move within {'', 'pending_review',
    -- 'revision_submitted'} — reviewer-only states can never be freshly set
    -- by the owner.
    IF NEW.review_status NOT IN ('', 'pending_review', 'revision_submitted') THEN
      RAISE EXCEPTION 'Illegal review_status transition % -> % for the submission owner', OLD.review_status, NEW.review_status;
    END IF;
    RETURN NEW;
  END IF;

  -- Reviewer-initiated transition. WHO may act on this specific row (buddy
  -- assigned to this joinee vs. their manager) is scoped by RLS; this trigger
  -- enforces WHICH transitions that role is allowed to make.
  IF actor_role = 'lead_instructor' THEN
    IF NOT (
      (OLD.review_status IN ('pending_review', 'revision_submitted') AND NEW.review_status = 'buddy_approved')
      OR (OLD.review_status IN ('pending_review', 'revision_submitted', 'buddy_approved') AND NEW.review_status = 'needs_revision')
    ) THEN
      RAISE EXCEPTION 'Illegal review_status transition % -> % for a buddy reviewer', OLD.review_status, NEW.review_status;
    END IF;
  ELSIF actor_role = 'academic_head' THEN
    IF NOT (OLD.review_status = 'buddy_approved' AND NEW.review_status = 'approved') THEN
      RAISE EXCEPTION 'Illegal review_status transition % -> % for a manager reviewer', OLD.review_status, NEW.review_status;
    END IF;
  ELSE
    -- H03/H24: onboarding_lead (and every other role) is SELECT-only and has
    -- no RLS UPDATE policy at all, so reaching here would mean RLS itself
    -- regressed. Fail closed regardless.
    RAISE EXCEPTION 'Role % is not permitted to change review_status', actor_role;
  END IF;

  actor_name := COALESCE(nullif(NEW.reviewer_name, ''), actor_role);
  NEW.review_history := OLD.review_history || jsonb_build_array(jsonb_build_object(
    'action', NEW.review_status,
    'reviewer_name', actor_name,
    'reviewer_id', actor::text,
    'comment', NEW.review_comment,
    'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_review_transition ON public.worksheet_submissions;
CREATE TRIGGER validate_review_transition
  BEFORE UPDATE ON public.worksheet_submissions
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_transition();
