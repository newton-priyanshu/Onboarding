-- =============================================================================
-- Migration: upsert_gate_submission() SECURITY DEFINER RPC (Codex Gap 2 / H2)
--
-- This is an ordered, verbatim slice of db/schema.sql (the canonical full
-- snapshot — see db/README.md for how these two are kept in sync and which
-- one to run). Every statement here is idempotent and safe to re-run.
-- =============================================================================

-- =============================================================================
-- 11B. GATE SUBMISSION RPC (H2 fix) — SECURITY DEFINER, lets a buddy create
--     or update a gate-control (gc1/gc2/gc3) worksheet_submissions row on
--     behalf of their assigned joinee. Gate-control worksheets are buddy-
--     authored (excluded from joinee routes) — a joinee never has a row for
--     them until their buddy files one. Every other worksheet type is
--     client-upserted directly by its owner, which is exactly why that path
--     cannot work here: "Insert own submissions" requires auth.uid() =
--     user_id, which is never true when a buddy is the one writing a row
--     owned by their joinee. This RPC performs its own authorization check
--     (must be the joinee's assigned buddy, or academic_head) and then does
--     the upsert with elevated privileges — the two RLS INSERT/UPDATE
--     policies on worksheet_submissions are irrelevant to this path since
--     SECURITY DEFINER bypasses RLS entirely.
-- =============================================================================

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
  result public.worksheet_submissions;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (up.assigned_buddy_id = caller) INTO is_assigned_buddy
  FROM public.user_profiles up
  WHERE up.id = p_user_id;

  IF NOT (COALESCE(is_assigned_buddy, false) OR caller_role = 'academic_head') THEN
    RAISE EXCEPTION 'Not authorized to submit a gate pass for this joinee';
  END IF;

  -- Gate-control worksheet ids are fixed (gc1/gc2/gc3); derive the owning
  -- phase from the id itself since the caller only supplies worksheet_id.
  v_phase := CASE p_worksheet_id
    WHEN 'gc1' THEN 'phase1'
    WHEN 'gc2' THEN 'phase2'
    WHEN 'gc3' THEN 'phase3'
    ELSE 'phase1'
  END;

  INSERT INTO public.worksheet_submissions (
    user_id, worksheet_id, worksheet_data, phase, status,
    review_status, reviewer_type, reviewed_by, reviewed_at
  )
  VALUES (
    p_user_id, p_worksheet_id, p_data, v_phase, 'Submitted',
    p_status, 'buddy', caller, now()
  )
  ON CONFLICT (user_id, worksheet_id) DO UPDATE
  SET worksheet_data = p_data,
      review_status = p_status,
      reviewed_by = caller,
      reviewed_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_gate_submission(uuid, text, jsonb, text) TO authenticated;
