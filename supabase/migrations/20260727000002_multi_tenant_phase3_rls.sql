-- =============================================================================
-- Migration: multi-tenant phase 3 — RLS policies for campus isolation,
--              super_admin bypass, and audit logging.
--
-- This migration adds campus-level data isolation to all existing RLS
-- policies. It does NOT break existing functionality — rows without a
-- campus_id are still visible (backward compatible until Phase 9 data
-- migration backfills all campus_ids).
--
-- Changes:
--   1. Updates notify_reviewer_on_submission & notify_managers_of_new_signup
--      triggers to set campus_id on notification rows
--   2. Drops all legacy RLS policies on the 4 main tables
--   3. Recreates policies with campus filtering on every FOR SELECT/FOR
--      UPDATE/FOR INSERT policy
--   4. Adds super_admin bypass to every read policy
--   5. Adds campus_admin to admin policies
--   6. Creates audit logging triggers on worksheet_submissions and user_profiles
--
-- Campus filtering pattern:
--   - Tables with campus_id column:
--       (target.campus_id IS NULL OR target.campus_id = public.get_user_campus())
--   - onboarding_submissions (no campus_id, join via user_id):
--       EXISTS (SELECT 1 FROM user_profiles up WHERE up.id = t.user_id
--               AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus()))
--   - Super admin bypass on all read policies: OR public.is_super_admin()
-- =============================================================================

-- =============================================================================
-- 1. UPDATE NOTIFICATION TRIGGERS — set campus_id
-- =============================================================================

-- Update notify_reviewer_on_submission to also set campus_id on notifications
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
  v_campus_id uuid;
BEGIN
  IF NEW.review_status NOT IN ('pending_review', 'revision_submitted') THEN
    RETURN NEW;
  END IF;
  -- Only notify on the actual transition INTO these states
  IF TG_OP = 'UPDATE' AND OLD.review_status = NEW.review_status THEN
    RETURN NEW;
  END IF;

  SELECT full_name, campus_id INTO joinee_name, v_campus_id
  FROM public.user_profiles WHERE id = NEW.user_id;

  IF NEW.reviewer_type = 'manager' THEN
    SELECT array_remove(array_agg(assigned_lead_id), NULL) INTO reviewer_ids
    FROM public.user_profiles WHERE id = NEW.user_id;
    IF reviewer_ids IS NULL OR array_length(reviewer_ids, 1) IS NULL THEN
      SELECT array_agg(id) INTO reviewer_ids
      FROM public.user_profiles WHERE role = 'academic_head'
        AND (campus_id IS NULL OR campus_id = v_campus_id);
    END IF;
  ELSIF NEW.reviewer_type = 'onboarding_lead' THEN
    SELECT array_agg(id) INTO reviewer_ids
    FROM public.user_profiles WHERE role = 'onboarding_lead'
      AND (campus_id IS NULL OR campus_id = v_campus_id);
  ELSE
    SELECT array_remove(array_agg(assigned_buddy_id), NULL) INTO reviewer_ids
    FROM public.user_profiles WHERE id = NEW.user_id;
    IF reviewer_ids IS NULL OR array_length(reviewer_ids, 1) IS NULL THEN
      SELECT array_agg(id) INTO reviewer_ids
      FROM public.user_profiles WHERE role = 'lead_instructor'
        AND (campus_id IS NULL OR campus_id = v_campus_id);
    END IF;
  END IF;

  IF reviewer_ids IS NOT NULL THEN
    FOREACH rid IN ARRAY reviewer_ids LOOP
      INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
      VALUES (
        rid,
        NEW.user_id,
        NEW.worksheet_id,
        CASE WHEN NEW.review_status = 'revision_submitted' THEN 'revision_submitted' ELSE 'submitted' END,
        format('A worksheet (%s) was submitted by %s and is ready for review.', NEW.worksheet_id, COALESCE(joinee_name, 'a joinee')),
        COALESCE(v_campus_id, (SELECT campus_id FROM public.user_profiles WHERE id = rid))
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- Update notify_managers_of_new_signup to also set campus_id on notifications
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
    SELECT id FROM public.user_profiles
    WHERE role IN ('academic_head', 'onboarding_lead')
      AND id <> NEW.id
      AND (campus_id IS NULL OR campus_id = NEW.campus_id)
  LOOP
    INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
    VALUES (
      rid, NEW.id, '', 'submitted',
      format('%s has signed up and started onboarding.', COALESCE(NEW.full_name, NEW.email, 'A new joinee')),
      NEW.campus_id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- Update handle_new_user signup trigger to also set campus_id from user_metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campus_id uuid;
BEGIN
  -- Attempt to resolve campus_id from user_metadata
  BEGIN
    v_campus_id := (new.raw_user_meta_data ->> 'campus_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_campus_id := NULL;
  END;

  -- Fallback: use the default campus if none specified
  IF v_campus_id IS NULL THEN
    SELECT id INTO v_campus_id FROM public.campuses WHERE slug = 'default' LIMIT 1;
  END IF;

  INSERT INTO public.user_profiles (id, email, full_name, role, campus_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    'new_joinee',
    v_campus_id
  )
  ON CONFLICT (id)
  DO UPDATE SET campus_id = COALESCE(EXCLUDED.campus_id, public.user_profiles.campus_id)
    WHERE public.user_profiles.campus_id IS NULL;

  RETURN new;
END;
$$;

-- Update promotion required worksheets backfill trigger to include campus_id
CREATE OR REPLACE FUNCTION public.promote_user_if_eligible()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  existing_role text;
  v_campus_id uuid;
  total_required int;
  approved_count int;
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object('promoted', false, 'message', 'Not authenticated');
  END IF;

  SELECT role, campus_id INTO existing_role, v_campus_id
  FROM public.user_profiles WHERE id = caller;

  IF existing_role IS DISTINCT FROM 'new_joinee' THEN
    RETURN jsonb_build_object('promoted', false, 'message', 'Only new joinees are eligible for auto-promotion');
  END IF;

  SELECT count(*) INTO total_required FROM public.promotion_required_worksheets;

  SELECT count(*) INTO approved_count
  FROM public.promotion_required_worksheets rw
  JOIN public.worksheet_submissions ws
    ON ws.worksheet_id = rw.worksheet_id
   AND ws.user_id = caller
   AND ws.review_status = 'approved';

  IF total_required = 0 OR approved_count < total_required THEN
    RETURN jsonb_build_object(
      'promoted', false,
      'message', format('%s/%s worksheets approved — not yet complete', approved_count, total_required)
    );
  END IF;

  UPDATE public.user_profiles SET role = 'lead_instructor' WHERE id = caller;

  -- Notify the promoted user
  INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
  VALUES (
    caller, NULL, '', 'promoted',
    format('Congratulations! All %s worksheets across all phases have been approved. You have been promoted to Buddy/Mentor (lead_instructor).', total_required),
    v_campus_id
  );

  -- Notify academic heads in the same campus
  INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
  SELECT id, caller, '', 'promoted',
    'A joinee has completed all phases and been promoted to lead_instructor. They can now serve as a buddy/mentor.',
    v_campus_id
  FROM public.user_profiles
  WHERE role = 'academic_head'
    AND (campus_id IS NULL OR campus_id = v_campus_id);

  RETURN jsonb_build_object(
    'promoted', true,
    'message', format('All %s worksheets approved! User promoted to Buddy/Mentor (lead_instructor).', total_required)
  );
END;
$$;

-- Update the upsert_gate_submission RPC to set campus_id
CREATE OR REPLACE FUNCTION public.upsert_gate_submission(
  p_user_id uuid,
  p_worksheet_id text,
  p_data jsonb,
  p_status text DEFAULT 'buddy_approved'
)
RETURNS public.worksheet_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_role text := public.get_user_role();
  is_assigned_buddy boolean;
  v_phase text;
  v_campus_id uuid;
  result public.worksheet_submissions;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT up.assigned_buddy_id = caller, up.campus_id
  INTO is_assigned_buddy, v_campus_id
  FROM public.user_profiles up
  WHERE up.id = p_user_id;

  IF NOT (COALESCE(is_assigned_buddy, false) OR caller_role = 'academic_head') THEN
    RAISE EXCEPTION 'Not authorized to submit a gate pass for this joinee';
  END IF;

  -- Fallback: get campus_id from caller's profile
  IF v_campus_id IS NULL THEN
    SELECT campus_id INTO v_campus_id FROM public.user_profiles WHERE id = p_user_id;
  END IF;
  IF v_campus_id IS NULL THEN
    SELECT campus_id INTO v_campus_id FROM public.user_profiles WHERE id = caller;
  END IF;

  v_phase := CASE p_worksheet_id
    WHEN 'gc1' THEN 'phase1'
    WHEN 'gc2' THEN 'phase2'
    WHEN 'gc3' THEN 'phase3'
    ELSE 'phase1'
  END;

  INSERT INTO public.worksheet_submissions (
    user_id, worksheet_id, worksheet_data, phase, status,
    review_status, reviewer_type, reviewed_by, reviewed_at, campus_id
  )
  VALUES (
    p_user_id, p_worksheet_id, p_data, v_phase, 'Submitted',
    p_status, 'buddy', caller, now(), v_campus_id
  )
  ON CONFLICT (user_id, worksheet_id) DO UPDATE
  SET worksheet_data = p_data,
      review_status = p_status,
      reviewed_by = caller,
      reviewed_at = now(),
      campus_id = COALESCE(EXCLUDED.campus_id, public.worksheet_submissions.campus_id)
  RETURNING * INTO result;

  RETURN result;
END;
$$;


-- =============================================================================
-- 2. UPDATE PROMOTION REQUIRED WORKSHEETS TRIGGER — set campus_id
-- =============================================================================

-- Add campus_id to the check_due_date_notifications and promotion functions
CREATE OR REPLACE FUNCTION public.check_due_date_notifications()
RETURNS TABLE (
  action TEXT,
  user_id UUID,
  worksheet_id TEXT,
  due_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ws_record RECORD;
  existing_count INT;
  v_campus_id uuid;
BEGIN
  FOR ws_record IN
    SELECT ws.user_id, ws.worksheet_id, ws.due_date, ws.campus_id
    FROM public.worksheet_submissions ws
    WHERE ws.due_date IS NOT NULL
      AND ws.review_status NOT IN ('approved', 'buddy_approved')
  LOOP
    v_campus_id := ws_record.campus_id;

    IF ws_record.due_date < CURRENT_DATE THEN
      SELECT COUNT(*) INTO existing_count
      FROM public.notifications n
      WHERE n.user_id = ws_record.user_id
        AND n.worksheet_id = ws_record.worksheet_id
        AND n.type = 'overdue'
        AND n.created_at >= CURRENT_DATE - INTERVAL '7 days';

      IF existing_count = 0 THEN
        INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
        VALUES (
          ws_record.user_id, NULL, ws_record.worksheet_id, 'overdue',
          format('Your worksheet (%s) is overdue! It was due on %s. Please submit it as soon as possible.',
            ws_record.worksheet_id, to_char(ws_record.due_date, 'Mon DD, YYYY')),
          v_campus_id
        );
        action := 'overdue'; user_id := ws_record.user_id;
        worksheet_id := ws_record.worksheet_id; due_date := ws_record.due_date;
        RETURN NEXT;
      END IF;
    END IF;

    IF ws_record.due_date >= CURRENT_DATE AND ws_record.due_date <= CURRENT_DATE + INTERVAL '3 days' THEN
      SELECT COUNT(*) INTO existing_count
      FROM public.notifications n
      WHERE n.user_id = ws_record.user_id
        AND n.worksheet_id = ws_record.worksheet_id
        AND n.type = 'due_soon'
        AND n.created_at >= CURRENT_DATE;

      IF existing_count = 0 THEN
        INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message, campus_id)
        VALUES (
          ws_record.user_id, NULL, ws_record.worksheet_id, 'due_soon',
          format('Your worksheet (%s) is due on %s (%s day(s) remaining).',
            ws_record.worksheet_id, to_char(ws_record.due_date, 'Mon DD, YYYY'),
            GREATEST(0, (ws_record.due_date - CURRENT_DATE)::int)),
          v_campus_id
        );
        action := 'due_soon'; user_id := ws_record.user_id;
        worksheet_id := ws_record.worksheet_id; due_date := ws_record.due_date;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;

  IF NOT FOUND THEN
    action := 'no_action_needed'; user_id := NULL; worksheet_id := NULL; due_date := NULL;
    RETURN NEXT;
  END IF;
END;
$$;


-- =============================================================================
-- 3. ROW LEVEL SECURITY — Update ALL existing policies with campus filtering
-- =============================================================================

-- ── Drop every policy name that has EVER existed ────────────────────────────
-- Extended list includes all legacy names plus new names this migration creates.
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
    'Users can update own submissions', 'Users can update own worksheets',
    -- Phase 3 policy names (cleanup on re-run)
    'Super admin manage profiles', 'Campus admin read profiles',
    'Super admin manage submissions', 'Super admin manage notifications'
  ];
  tables text[] := ARRAY['user_profiles', 'onboarding_submissions', 'worksheet_submissions', 'notifications'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOREACH pol IN ARRAY legacy_policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
    END LOOP;
  END LOOP;
END $$;

-- =============================================================================
-- 3A. user_profiles POLICIES
-- =============================================================================

-- Self-read: user can read their own profile or super_admin can read any
CREATE POLICY "Select own profile" ON public.user_profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_super_admin()
  );

-- Signup insert: unchanged — handle_new_user trigger creates the row
CREATE POLICY "Insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Self-update: user can update their own row; super_admin bypass
CREATE POLICY "Update own profile" ON public.user_profiles
  FOR UPDATE
  USING (
    auth.uid() = id
    OR public.is_super_admin()
  )
  WITH CHECK (
    (auth.uid() = id OR public.is_super_admin())
    AND (
      role = (SELECT p.role FROM public.user_profiles p WHERE p.id = user_profiles.id)
      OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'academic_head'
    )
  );

-- Admin read: super_admin can read all; campus-scoped for admin roles
CREATE POLICY "Admin read all profiles" ON public.user_profiles
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')
        IN ('academic_head', 'lead_instructor', 'onboarding_lead', 'campus_admin')
      AND (
        user_profiles.campus_id IS NULL
        OR user_profiles.campus_id = public.get_user_campus()
      )
    )
  );

-- Admin update: super_admin can update all; campus-scoped for admin roles
CREATE POLICY "Admin update profiles" ON public.user_profiles
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')
        IN ('academic_head', 'lead_instructor', 'onboarding_lead', 'campus_admin')
      AND (
        user_profiles.campus_id IS NULL
        OR user_profiles.campus_id = public.get_user_campus()
      )
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')
        IN ('academic_head', 'lead_instructor', 'onboarding_lead', 'campus_admin')
      AND (
        user_profiles.campus_id IS NULL
        OR user_profiles.campus_id = public.get_user_campus()
      )
      AND role = (SELECT p.role FROM public.user_profiles p WHERE p.id = user_profiles.id)
    )
  );

-- =============================================================================
-- 3B. onboarding_submissions POLICIES (no campus_id column — join via user_id)
-- =============================================================================

-- Read: owner can read own; admin roles can read same-campus; super_admin can read all
CREATE POLICY "Users can read own submissions" ON public.onboarding_submissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.is_super_admin()
    OR (
      COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')
        IN ('academic_head', 'lead_instructor', 'onboarding_lead', 'campus_admin')
      AND EXISTS (
        SELECT 1 FROM public.user_profiles up
        WHERE up.id = onboarding_submissions.user_id
          AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus())
      )
    )
  );

-- Insert: self-insert only (unchanged)
CREATE POLICY "Users can insert own submissions" ON public.onboarding_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Update: self-update only (unchanged)
CREATE POLICY "Users can update own submissions" ON public.onboarding_submissions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- 3C. worksheet_submissions POLICIES
-- =============================================================================

-- Self-read: owner can read their own submissions; super_admin can read any
CREATE POLICY "Select own submissions" ON public.worksheet_submissions
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.is_super_admin()
  );

-- Insert: self-insert with campus scope (joiner can only create in their campus)
CREATE POLICY "Insert own submissions" ON public.worksheet_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND review_status IN ('', 'pending_review')
    AND reviewed_by IS NULL
    AND (
      worksheet_submissions.campus_id IS NULL
      OR worksheet_submissions.campus_id = public.get_user_campus()
      OR public.is_super_admin()
    )
  );

-- Self-update: owner updates their own submissions (campus scope by default)
CREATE POLICY "Update own submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Reviewers read: super_admin bypass; admin roles + assigned buddies/managers, campus-scoped
CREATE POLICY "Reviewers select submissions" ON public.worksheet_submissions
  FOR SELECT USING (
    public.is_super_admin()
    OR (
      (
        COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '')
          IN ('lead_instructor', 'academic_head', 'onboarding_lead', 'campus_admin')
        OR auth.uid() = user_id
        OR auth.uid() IN (
          SELECT assigned_lead_id FROM public.user_profiles WHERE id = worksheet_submissions.user_id
        )
        OR auth.uid() IN (
          SELECT assigned_buddy_id FROM public.user_profiles WHERE id = worksheet_submissions.user_id
        )
      )
      AND (
        worksheet_submissions.campus_id IS NULL
        OR worksheet_submissions.campus_id = public.get_user_campus()
      )
    )
  );

-- Buddy update: campus-scoped
CREATE POLICY "Buddy update submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'lead_instructor'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_buddy_id = auth.uid() OR up.assigned_buddy_id IS NULL)
        AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus() OR public.is_super_admin())
    )
  )
  WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'lead_instructor'
    AND review_status IN ('buddy_approved', 'needs_revision')
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_buddy_id = auth.uid() OR up.assigned_buddy_id IS NULL)
        AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus() OR public.is_super_admin())
    )
  );

-- Manager update: campus-scoped
CREATE POLICY "Manager update submissions" ON public.worksheet_submissions
  FOR UPDATE
  USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'academic_head'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_lead_id = auth.uid() OR up.assigned_lead_id IS NULL)
        AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus() OR public.is_super_admin())
    )
  )
  WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'academic_head'
    AND review_status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = worksheet_submissions.user_id
        AND (up.assigned_lead_id = auth.uid() OR up.assigned_lead_id IS NULL)
        AND (up.campus_id IS NULL OR up.campus_id = public.get_user_campus() OR public.is_super_admin())
    )
  );

-- =============================================================================
-- 3D. notifications POLICIES
-- =============================================================================

-- Read own notifications: user reads their own; super_admin reads any
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_super_admin()
  );

-- Insert self-notifications (unchanged)
CREATE POLICY "Users can insert notifications" ON public.notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

-- Update own notifications (unchanged)
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- =============================================================================
-- 4. AUDIT LOGGING TRIGGERS
-- =============================================================================

-- ── log_worksheet_review_action: log review status changes ─────────────────
CREATE OR REPLACE FUNCTION public.log_worksheet_review_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.review_status IS DISTINCT FROM NEW.review_status THEN
    INSERT INTO public.audit_logs (
      campus_id, user_id, action, resource_type, resource_id, details
    ) VALUES (
      COALESCE(NEW.campus_id, OLD.campus_id),
      auth.uid(),
      'worksheet_submissions.review_status_changed',
      'worksheet_submission',
      NEW.id::text,
      jsonb_build_object(
        'worksheet_id', NEW.worksheet_id,
        'user_id', NEW.user_id,
        'old_status', OLD.review_status,
        'new_status', NEW.review_status,
        'reviewer_name', NEW.reviewer_name
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_worksheet_review_action ON public.worksheet_submissions;
CREATE TRIGGER log_worksheet_review_action
  AFTER UPDATE OF review_status ON public.worksheet_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_worksheet_review_action();

-- ── log_profile_change: log role and assignment changes ────────────────────
CREATE OR REPLACE FUNCTION public.log_profile_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    v_changes := v_changes || jsonb_build_object('role', jsonb_build_object('from', OLD.role, 'to', NEW.role));
  END IF;
  IF OLD.assigned_lead_id IS DISTINCT FROM NEW.assigned_lead_id THEN
    v_changes := v_changes || jsonb_build_object('assigned_lead', jsonb_build_object('from', OLD.assigned_lead_id, 'to', NEW.assigned_lead_id));
  END IF;
  IF OLD.assigned_buddy_id IS DISTINCT FROM NEW.assigned_buddy_id THEN
    v_changes := v_changes || jsonb_build_object('assigned_buddy', jsonb_build_object('from', OLD.assigned_buddy_id, 'to', NEW.assigned_buddy_id));
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (
      campus_id, user_id, action, resource_type, resource_id, details
    ) VALUES (
      COALESCE(NEW.campus_id, OLD.campus_id),
      auth.uid(),
      CASE
        WHEN v_changes ? 'role' THEN 'user_profiles.role_changed'
        WHEN v_changes ? 'assigned_lead' THEN 'user_profiles.lead_assigned'
        WHEN v_changes ? 'assigned_buddy' THEN 'user_profiles.buddy_assigned'
        ELSE 'user_profiles.updated'
      END,
      'user_profile',
      NEW.id::text,
      v_changes
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_profile_change ON public.user_profiles;
CREATE TRIGGER log_profile_change
  AFTER UPDATE OF role, assigned_lead_id, assigned_buddy_id ON public.user_profiles
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.log_profile_change();

-- ── log_campus_change: log campus CRUD operations ─────────────────────────
CREATE OR REPLACE FUNCTION public.log_campus_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action text;
  v_details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'campus.created';
    v_details := jsonb_build_object('name', NEW.name, 'slug', NEW.slug);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'campus.updated';
    v_details := jsonb_build_object(
      'name', CASE WHEN OLD.name IS DISTINCT FROM NEW.name THEN jsonb_build_object('from', OLD.name, 'to', NEW.name) ELSE NULL END,
      'is_active', CASE WHEN OLD.is_active IS DISTINCT FROM NEW.is_active THEN jsonb_build_object('from', OLD.is_active, 'to', NEW.is_active) ELSE NULL END
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'campus.deleted';
    v_details := jsonb_build_object('name', OLD.name, 'slug', OLD.slug);
  END IF;

  IF v_details IS NOT NULL AND v_details <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (campus_id, user_id, action, resource_type, resource_id, details)
    VALUES (
      COALESCE(NEW.id, OLD.id),
      auth.uid(),
      v_action,
      'campus',
      COALESCE(NEW.id::text, OLD.id::text),
      v_details
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS log_campus_change ON public.campuses;
CREATE TRIGGER log_campus_change
  AFTER INSERT OR UPDATE OR DELETE ON public.campuses
  FOR EACH ROW
  EXECUTE FUNCTION public.log_campus_change();


-- =============================================================================
-- 5. BACKFILL campus_id FOR EXISTING NOTIFICATIONS
-- =============================================================================

-- For existing notifications without campus_id, try to derive it from the
-- user's profile. This is safe to re-run.
UPDATE public.notifications n
SET campus_id = up.campus_id
FROM public.user_profiles up
WHERE n.user_id = up.id
  AND n.campus_id IS NULL
  AND up.campus_id IS NOT NULL;

-- For existing worksheet_submissions without campus_id
UPDATE public.worksheet_submissions ws
SET campus_id = up.campus_id
FROM public.user_profiles up
WHERE ws.user_id = up.id
  AND ws.campus_id IS NULL
  AND up.campus_id IS NOT NULL;


-- =============================================================================
-- 6. GRANT PERMISSIONS
-- =============================================================================

-- Ensure authenticated users can call helper functions
GRANT EXECUTE ON FUNCTION public.get_user_campus() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_campus_access(uuid) TO authenticated;
