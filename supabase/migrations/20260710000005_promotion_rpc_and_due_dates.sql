-- =============================================================================
-- Migration: promote_user_if_eligible() SECURITY DEFINER RPC + optional due-date notification utility
--
-- This is an ordered, verbatim slice of db/schema.sql (the canonical full
-- snapshot — see db/README.md for how these two are kept in sync and which
-- one to run). Every statement here is idempotent and safe to re-run.
-- =============================================================================

-- =============================================================================
-- 11. AUTO-PROMOTION RPC (contract item 3) — SECURITY DEFINER, acts only on
--     auth.uid() (the caller), never on behalf of another session.
-- =============================================================================

-- Canonical list of worksheets required for auto-promotion to lead_instructor.
-- NOTE: this must be kept in sync with PHASE_WORKSHEETS_MAP (phases 1-3) in
-- src/config/worksheetConfigData.ts — the DB has no way to import that TS
-- config, so this table is the server-side mirror of it. If that map changes,
-- update this table too (flagged as a cross-stream risk).
CREATE TABLE IF NOT EXISTS public.promotion_required_worksheets (
  worksheet_id TEXT PRIMARY KEY
);

INSERT INTO public.promotion_required_worksheets (worksheet_id) VALUES
  ('p1_w1'), ('p1_w2'), ('p1_w3'), ('p1_w4'), ('p1_w5'), ('p1_w6'), ('p1_w8'),
  ('w1_o1'), ('w1_e1'), ('w1_o2'), ('w1_g1'), ('gc1'),
  ('p2_w1'), ('p2_w2'), ('p2_w3'), ('p2_w4'), ('gc2'),
  ('p3_w1'), ('p3_w2'), ('p3_w3'), ('p3_w4'), ('p3_w5'), ('gc3')
ON CONFLICT (worksheet_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.promote_user_if_eligible()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  existing_role text; -- NOTE: never name this "current_role" — that's a
                       -- reserved Postgres keyword (CURRENT_ROLE) and silently
                       -- shadows/resolves to the session role, not this value.
  total_required int;
  approved_count int;
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object('promoted', false, 'message', 'Not authenticated');
  END IF;

  SELECT role INTO existing_role FROM public.user_profiles WHERE id = caller;

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
  -- app_metadata is kept in sync automatically by sync_role_to_app_metadata().

  INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
  VALUES (
    caller, NULL, '', 'promoted',
    format('Congratulations! All %s worksheets across all phases have been approved. You have been promoted to Buddy/Mentor (lead_instructor).', total_required)
  );

  INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
  SELECT id, caller, '', 'promoted',
    'A joinee has completed all phases and been promoted to lead_instructor. They can now serve as a buddy/mentor.'
  FROM public.user_profiles WHERE role = 'academic_head';

  RETURN jsonb_build_object(
    'promoted', true,
    'message', format('All %s worksheets approved! User promoted to Buddy/Mentor (lead_instructor).', total_required)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_user_if_eligible() TO authenticated;


-- =============================================================================
-- 12. DUE-DATE NOTIFICATIONS (optional utility; unchanged behavior, aligned
--     to the unified notifications CHECK from section 4). Not scheduled by
--     default — see the commented pg_cron block at the end of this section.
-- =============================================================================

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
BEGIN
  FOR ws_record IN
    SELECT ws.user_id, ws.worksheet_id, ws.due_date
    FROM public.worksheet_submissions ws
    WHERE ws.due_date IS NOT NULL
      AND ws.review_status NOT IN ('approved', 'buddy_approved')
  LOOP
    IF ws_record.due_date < CURRENT_DATE THEN
      SELECT COUNT(*) INTO existing_count
      FROM public.notifications n
      WHERE n.user_id = ws_record.user_id
        AND n.worksheet_id = ws_record.worksheet_id
        AND n.type = 'overdue'
        AND n.created_at >= CURRENT_DATE - INTERVAL '7 days';

      IF existing_count = 0 THEN
        INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
        VALUES (
          ws_record.user_id, NULL, ws_record.worksheet_id, 'overdue',
          format('Your worksheet (%s) is overdue! It was due on %s. Please submit it as soon as possible.',
            ws_record.worksheet_id, to_char(ws_record.due_date, 'Mon DD, YYYY'))
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
        INSERT INTO public.notifications (user_id, from_user_id, worksheet_id, type, message)
        VALUES (
          ws_record.user_id, NULL, ws_record.worksheet_id, 'due_soon',
          format('Your worksheet (%s) is due on %s (%s day(s) remaining).',
            ws_record.worksheet_id, to_char(ws_record.due_date, 'Mon DD, YYYY'),
            GREATEST(0, (ws_record.due_date - CURRENT_DATE)::int))
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

-- To schedule (requires pg_cron enabled — Supabase Dashboard → Database →
-- Extensions → pg_cron):
--   SELECT cron.schedule('check-due-date-notifications', '30 2 * * *',
--     $$SELECT public.check_due_date_notifications()$$);


