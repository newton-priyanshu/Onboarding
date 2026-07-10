-- =============================================================================
-- Migration: server-side reviewer/signup notification triggers (notify_reviewer_on_submission, notify_managers_of_new_signup)
--
-- This is an ordered, verbatim slice of db/schema.sql (the canonical full
-- snapshot — see db/README.md for how these two are kept in sync and which
-- one to run). Every statement here is idempotent and safe to re-run.
-- =============================================================================

-- =============================================================================
-- 10. SERVER-SIDE NOTIFICATIONS (H22 + contract item 5) — clients no longer
--     need to (and per the contract, must not) insert submission/signup
--     notifications; the DB creates them directly, bypassing RLS via
--     SECURITY DEFINER, so they can never be blocked or forged by the client.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_reviewer_on_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  reviewer_ids uuid[];
  rid uuid;
  joinee_name text;
BEGIN
  IF NEW.review_status NOT IN ('pending_review', 'revision_submitted') THEN
    RETURN NEW;
  END IF;
  -- Only notify on the actual transition INTO these states, not on every
  -- subsequent autosave that merely re-persists the same review_status.
  IF TG_OP = 'UPDATE' AND OLD.review_status = NEW.review_status THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO joinee_name FROM public.user_profiles WHERE id = NEW.user_id;

  IF NEW.reviewer_type = 'manager' THEN
    SELECT array_remove(array_agg(assigned_lead_id), NULL) INTO reviewer_ids
    FROM public.user_profiles WHERE id = NEW.user_id;
    IF reviewer_ids IS NULL OR array_length(reviewer_ids, 1) IS NULL THEN
      SELECT array_agg(id) INTO reviewer_ids FROM public.user_profiles WHERE role = 'academic_head';
    END IF;
  ELSIF NEW.reviewer_type = 'onboarding_lead' THEN
    SELECT array_agg(id) INTO reviewer_ids FROM public.user_profiles WHERE role = 'onboarding_lead';
  ELSE
    SELECT array_remove(array_agg(assigned_buddy_id), NULL) INTO reviewer_ids
    FROM public.user_profiles WHERE id = NEW.user_id;
    IF reviewer_ids IS NULL OR array_length(reviewer_ids, 1) IS NULL THEN
      SELECT array_agg(id) INTO reviewer_ids FROM public.user_profiles WHERE role = 'lead_instructor';
    END IF;
  END IF;

  IF reviewer_ids IS NOT NULL THEN
    FOREACH rid IN ARRAY reviewer_ids LOOP
      INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
      VALUES (
        rid,
        NEW.user_id,
        NEW.worksheet_id,
        CASE WHEN NEW.review_status = 'revision_submitted' THEN 'revision_submitted' ELSE 'submitted' END,
        format('A worksheet (%s) was submitted by %s and is ready for review.', NEW.worksheet_id, COALESCE(joinee_name, 'a joinee'))
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_reviewer_on_submission ON public.worksheet_submissions;
CREATE TRIGGER notify_reviewer_on_submission
  AFTER INSERT OR UPDATE OF review_status ON public.worksheet_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_reviewer_on_submission();

CREATE OR REPLACE FUNCTION public.notify_managers_of_new_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rid uuid;
BEGIN
  IF NEW.role <> 'new_joinee' THEN
    RETURN NEW;
  END IF;
  FOR rid IN
    SELECT id FROM public.user_profiles WHERE role IN ('academic_head', 'onboarding_lead') AND id <> NEW.id
  LOOP
    INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
    VALUES (
      rid, NEW.id, '', 'submitted',
      format('%s has signed up and started onboarding.', COALESCE(NEW.full_name, NEW.email, 'A new joinee'))
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_managers_of_new_signup ON public.user_profiles;
CREATE TRIGGER notify_managers_of_new_signup
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_managers_of_new_signup();


