-- ═══════════════════════════════════════════════════════════════════════════
-- GAMIFICATION — XP, levels, streaks, persisted achievements & certificates
--
-- Completes the onboarding loop end-to-end:
--   joinee fills worksheet → XP → level up → streaks → achievements (persisted)
--   → buddy/manager approvals award XP → phase bonuses → certificate on completion
--   → campus leaderboard for campus heads → joinee gamification for buddies/managers.
--
-- ⚠️  XP amounts below are the CANONICAL source of truth. The frontend mirrors
-- them in src/config/gamification.ts (XP_RULES + LEVEL_XP). Keep both in sync.
--
-- Designed to be applied with a SUPABASE_PAT (see scripts/run_gamification_migration.cjs)
-- or pasted into the SQL editor. Fully idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. gamification_profiles ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gamification_profiles (
  user_id            uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  campus_id          uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  total_xp           integer NOT NULL DEFAULT 0,
  level              integer NOT NULL DEFAULT 1,
  current_streak     integer NOT NULL DEFAULT 0,
  longest_streak     integer NOT NULL DEFAULT 0,
  last_activity_date date,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gamification_profiles_xp_non_negative CHECK (total_xp >= 0),
  CONSTRAINT gamification_profiles_level_positive CHECK (level >= 1),
  CONSTRAINT gamification_profiles_streak_non_negative CHECK (current_streak >= 0 AND longest_streak >= 0)
);

-- ─── 2. xp_events — auditable trail of every XP award ───────────────────────
CREATE TABLE IF NOT EXISTS public.xp_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  campus_id    uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  event_type   text NOT NULL, -- 'submit' | 'revision_submit' | 'buddy_approved' | 'manager_approved' | 'phase_complete' | 'onboarding_complete'
  amount       integer NOT NULL,
  source_id    text,          -- worksheet_id, 'phase:1', 'phase:2', 'phase:3', 'onboarding'
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xp_events_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS xp_events_user_created_idx ON public.xp_events (user_id, created_at DESC);

-- ─── 3. user_achievements — persisted unlocks (survive browsers/devices) ────
CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id        uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  unlocked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS user_achievements_user_idx ON public.user_achievements (user_id);

-- ─── 4. completion_certificates — one per graduated joinee ──────────────────
CREATE TABLE IF NOT EXISTS public.completion_certificates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL UNIQUE REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  campus_id          uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  certificate_number text NOT NULL UNIQUE,
  issued_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── 5. RLS helper — who may view a user's gamification ─────────────────────
-- SECURITY DEFINER so the policy stays simple and recursion-free.
-- Caller may view: themselves, super admins, assigned buddies/leads,
-- and campus heads/admins of the target user's campus.
DROP FUNCTION IF EXISTS public.can_view_user_gamification(uuid);
CREATE OR REPLACE FUNCTION public.can_view_user_gamification(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN false;
  END IF;

  -- Self + super admin
  IF v_caller = p_user_id OR public.is_super_admin() THEN
    RETURN true;
  END IF;

  -- Assigned buddy or lead (manager)
  IF EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = p_user_id
      AND (up.assigned_buddy_id = v_caller OR up.assigned_lead_id = v_caller)
  ) THEN
    RETURN true;
  END IF;

  -- Campus head / campus admin within the same campus
  IF public.get_user_role() IN ('campus_head', 'campus_admin') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = p_user_id
        AND up.campus_id = public.get_user_campus()
    );
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_user_gamification(uuid) TO authenticated;

-- ─── 6. Phase membership helpers (mirror src/config/worksheetConfigData.ts) ─
-- Each department has its OWN phase map (academics / progression / operations)
-- exactly like the frontend getDeptPhaseMap(). A joinee's completion is judged
-- only against their own department's worksheets.
DROP FUNCTION IF EXISTS public.gamify_phase_sheets(integer);
DROP FUNCTION IF EXISTS public.gamify_phase_sheets(integer, text);
CREATE OR REPLACE FUNCTION public.gamify_phase_sheets(p_phase integer, p_dept text DEFAULT 'academics')
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE p_dept
    WHEN 'progression' THEN
      CASE p_phase
        WHEN 1 THEN ARRAY['pr_p1_w1','pr_p1_w2','pr_p1_w3','pr_p1_w4','pr_p1_w5','pr_p1_w6','pr_gc1']
        WHEN 2 THEN ARRAY['pr_p2_w1','pr_p2_w2','pr_p2_w3','pr_gc2']
        WHEN 3 THEN ARRAY['pr_p3_w1','pr_p3_w2','pr_p3_w3','pr_p3_w4','pr_gc3']
        ELSE ARRAY[]::text[]
      END
    WHEN 'operations' THEN
      CASE p_phase
        WHEN 1 THEN ARRAY['op_p1_w1','op_p1_w2','op_p1_w3','op_p1_w4','op_p1_w5','op_p1_w6','op_gc1']
        WHEN 2 THEN ARRAY['op_p2_w1','op_p2_w2','op_p2_w3','op_gc2']
        WHEN 3 THEN ARRAY['op_p3_w1','op_p3_w2','op_p3_w3','op_p3_w4','op_gc3']
        ELSE ARRAY[]::text[]
      END
    ELSE -- academics (default)
      CASE p_phase
        WHEN 1 THEN ARRAY[
          'p1_w5','p1_w6','p1_w3','w1_o1','w1_e1','w1_o2','w1_g1',
          'p1_w1','p1_w2','p1_w4','p1_w8','gc1'
        ]
        WHEN 2 THEN ARRAY['p2_w1','p2_w2','p2_w3','p2_w4','gc2']
        WHEN 3 THEN ARRAY['p3_w1','p3_w2','p3_w3','p3_w4','p3_w5','gc3']
        ELSE ARRAY[]::text[]
      END
  END
$$;

DROP FUNCTION IF EXISTS public.gamify_phase_of_worksheet(text);
DROP FUNCTION IF EXISTS public.gamify_phase_of_worksheet(text, text);
CREATE OR REPLACE FUNCTION public.gamify_phase_of_worksheet(p_ws_id text, p_dept text DEFAULT 'academics')
RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_ws_id = ANY(public.gamify_phase_sheets(1, p_dept)) THEN 1
    WHEN p_ws_id = ANY(public.gamify_phase_sheets(2, p_dept)) THEN 2
    WHEN p_ws_id = ANY(public.gamify_phase_sheets(3, p_dept)) THEN 3
    ELSE NULL
  END
$$;

-- ─── 7. Level formula — level = floor(total_xp / LEVEL_XP) + 1 ──────────────
DROP FUNCTION IF EXISTS public.gamify_level(integer);
CREATE OR REPLACE FUNCTION public.gamify_level(p_xp integer)
RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT floor(GREATEST(p_xp, 0) / 250)::integer + 1
$$;

-- ─── 8. Core XP trigger — awards on worksheet review_status transitions ─────
-- Canonical XP amounts (mirror src/config/gamification.ts):
--   pending_review      → +25  (submit)
--   revision_submitted  → +25  (revision re-submit)
--   buddy_approved      → +50  (buddy approval)
--   approved            → +50  (manager/phase approval)
--   phase_complete      → +150 (bonus once per phase, all sheets approved)
--   onboarding_complete → +500 (bonus once, all 3 phases approved + certificate)
DROP FUNCTION IF EXISTS public.award_xp_on_worksheet_event();
CREATE OR REPLACE FUNCTION public.award_xp_on_worksheet_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_xp            integer := 0;
  v_event_type    text;
  v_source        text := NEW.worksheet_id;
  v_activity      boolean := false; -- submit-like events advance the streak
  v_campus        uuid := NEW.campus_id;
  v_dept          text;
  v_phase         integer;
  v_phase_sheets  text[];
  v_all_approved  boolean;
  v_cert_number   text;
  v_phase1_done   boolean;
  v_phase2_done   boolean;
  v_phase3_done   boolean;
BEGIN
  -- The joinee's department decides which phase map to judge completion against.
  v_dept := COALESCE((SELECT up.department FROM public.user_profiles up WHERE up.id = NEW.user_id), 'academics');

  IF NEW.review_status IS DISTINCT FROM OLD.review_status OR TG_OP = 'INSERT' THEN
    -- Map status → XP
    IF NEW.review_status = 'pending_review' THEN
      v_xp := 25; v_event_type := 'submit'; v_activity := true;
    ELSIF NEW.review_status = 'revision_submitted' THEN
      v_xp := 25; v_event_type := 'revision_submit'; v_activity := true;
    ELSIF NEW.review_status = 'buddy_approved' THEN
      v_xp := 50; v_event_type := 'buddy_approved';
    ELSIF NEW.review_status = 'approved' THEN
      v_xp := 50; v_event_type := 'manager_approved';
    END IF;
  END IF;

  -- Streak advance on submit-like activity (skip for INSERTs that are just
  -- autosaved drafts — those carry review_status = '' so v_activity stays false).
  IF v_activity AND NEW.review_status IS NOT NULL THEN
    UPDATE public.gamification_profiles g
    SET current_streak = CASE
          WHEN g.last_activity_date = CURRENT_DATE THEN g.current_streak
          WHEN g.last_activity_date = CURRENT_DATE - 1 THEN g.current_streak + 1
          ELSE 1
        END,
        longest_streak = GREATEST(g.longest_streak,
          CASE
            WHEN g.last_activity_date = CURRENT_DATE - 1 THEN g.current_streak + 1
            ELSE 1
          END),
        last_activity_date = CURRENT_DATE,
        updated_at = now()
    WHERE g.user_id = NEW.user_id;

    IF NOT FOUND THEN
      INSERT INTO public.gamification_profiles (user_id, campus_id, total_xp, level, current_streak, longest_streak, last_activity_date)
      VALUES (NEW.user_id, v_campus, 0, public.gamify_level(0), 1, 1, CURRENT_DATE)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;

  -- Award XP (create profile lazily if it doesn't exist yet)
  IF v_xp > 0 THEN
    INSERT INTO public.gamification_profiles (user_id, campus_id, total_xp, level)
    VALUES (NEW.user_id, v_campus, v_xp, public.gamify_level(v_xp))
    ON CONFLICT (user_id) DO UPDATE
      SET total_xp = public.gamification_profiles.total_xp + v_xp,
          level    = public.gamify_level(public.gamification_profiles.total_xp + v_xp),
          campus_id = COALESCE(EXCLUDED.campus_id, public.gamification_profiles.campus_id),
          updated_at = now();

    INSERT INTO public.xp_events (user_id, campus_id, event_type, amount, source_id)
    VALUES (NEW.user_id, v_campus, v_event_type, v_xp, v_source);
  END IF;

  -- ── Phase completion bonus ─────────────────────────────────────────────
  IF NEW.review_status = 'approved' THEN
    v_phase := public.gamify_phase_of_worksheet(NEW.worksheet_id, v_dept);
    IF v_phase IS NOT NULL THEN
      v_phase_sheets := public.gamify_phase_sheets(v_phase, v_dept);
      SELECT bool_and(COALESCE(s.review_status = 'approved', false))
        INTO v_all_approved
        FROM unnest(v_phase_sheets) AS ws(wsid)
        LEFT JOIN LATERAL (
          SELECT review_status FROM public.worksheet_submissions w
          WHERE w.user_id = NEW.user_id AND w.worksheet_id = ws.wsid
          ORDER BY w.updated_at DESC LIMIT 1
        ) s ON true;

      IF v_all_approved
         AND NOT EXISTS (
           SELECT 1 FROM public.xp_events e
           WHERE e.user_id = NEW.user_id
             AND e.event_type = 'phase_complete'
             AND e.source_id = 'phase:' || v_phase
         ) THEN
        INSERT INTO public.gamification_profiles (user_id, campus_id, total_xp, level)
        VALUES (NEW.user_id, v_campus, 150, public.gamify_level(150))
        ON CONFLICT (user_id) DO UPDATE
          SET total_xp = public.gamification_profiles.total_xp + 150,
              level    = public.gamify_level(public.gamification_profiles.total_xp + 150),
              updated_at = now();

        INSERT INTO public.xp_events (user_id, campus_id, event_type, amount, source_id)
        VALUES (NEW.user_id, v_campus, 'phase_complete', 150, 'phase:' || v_phase);
      END IF;
    END IF;

    -- ── Onboarding completion: all 3 phases approved → certificate + bonus ──
    SELECT
      (SELECT bool_and(COALESCE(s.review_status = 'approved', false))
         FROM unnest(public.gamify_phase_sheets(1, v_dept)) ws(wsid)
         LEFT JOIN LATERAL (SELECT review_status FROM public.worksheet_submissions w
                            WHERE w.user_id = NEW.user_id AND w.worksheet_id = ws.wsid
                            ORDER BY w.updated_at DESC LIMIT 1) s ON true),
      (SELECT bool_and(COALESCE(s.review_status = 'approved', false))
         FROM unnest(public.gamify_phase_sheets(2, v_dept)) ws(wsid)
         LEFT JOIN LATERAL (SELECT review_status FROM public.worksheet_submissions w
                            WHERE w.user_id = NEW.user_id AND w.worksheet_id = ws.wsid
                            ORDER BY w.updated_at DESC LIMIT 1) s ON true),
      (SELECT bool_and(COALESCE(s.review_status = 'approved', false))
         FROM unnest(public.gamify_phase_sheets(3, v_dept)) ws(wsid)
         LEFT JOIN LATERAL (SELECT review_status FROM public.worksheet_submissions w
                            WHERE w.user_id = NEW.user_id AND w.worksheet_id = ws.wsid
                            ORDER BY w.updated_at DESC LIMIT 1) s ON true)
      INTO v_phase1_done, v_phase2_done, v_phase3_done;

    IF v_phase1_done AND v_phase2_done AND v_phase3_done
       AND NOT EXISTS (SELECT 1 FROM public.completion_certificates c WHERE c.user_id = NEW.user_id) THEN
      v_cert_number := 'NST-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text), 1, 6));
      INSERT INTO public.completion_certificates (user_id, campus_id, certificate_number)
      VALUES (NEW.user_id, v_campus, v_cert_number);

      INSERT INTO public.gamification_profiles (user_id, campus_id, total_xp, level)
      VALUES (NEW.user_id, v_campus, 500, public.gamify_level(500))
      ON CONFLICT (user_id) DO UPDATE
        SET total_xp = public.gamification_profiles.total_xp + 500,
            level    = public.gamify_level(public.gamification_profiles.total_xp + 500),
            updated_at = now();

      INSERT INTO public.xp_events (user_id, campus_id, event_type, amount, source_id)
      VALUES (NEW.user_id, v_campus, 'onboarding_complete', 500, 'onboarding');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 9. Trigger wiring (idempotent) ─────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_award_xp_on_worksheet_event ON public.worksheet_submissions;
CREATE TRIGGER trg_award_xp_on_worksheet_event
  AFTER INSERT OR UPDATE OF review_status ON public.worksheet_submissions
  FOR EACH ROW EXECUTE FUNCTION public.award_xp_on_worksheet_event();

-- ─── 10. RPC: sync achievement unlocks (called by useAchievements) ──────────
DROP FUNCTION IF EXISTS public.sync_achievement_unlocks(text[]);
CREATE OR REPLACE FUNCTION public.sync_achievement_unlocks(p_achievement_ids text[])
RETURNS SETOF public.user_achievements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_campus uuid;
BEGIN
  IF v_caller IS NULL OR p_achievement_ids IS NULL OR cardinality(p_achievement_ids) = 0 THEN
    RETURN;
  END IF;

  SELECT campus_id INTO v_campus FROM public.user_profiles WHERE id = v_caller;

  INSERT INTO public.user_achievements (user_id, achievement_id)
  SELECT v_caller, unnest(p_achievement_ids)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  RETURN QUERY SELECT * FROM public.user_achievements WHERE user_id = v_caller;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_achievement_unlocks(text[]) TO authenticated;

-- ─── 11. RPC: campus leaderboard (campus head / admin / super admin) ─────────
DROP FUNCTION IF EXISTS public.get_campus_leaderboard(integer);
CREATE OR REPLACE FUNCTION public.get_campus_leaderboard(p_limit integer DEFAULT 20)
RETURNS TABLE (
  rank        bigint,
  user_id     uuid,
  full_name   text,
  total_xp    integer,
  level       integer,
  current_streak integer,
  achievements bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_campus uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN;
  END IF;

  IF public.is_super_admin() THEN
    v_campus := NULL; -- super admin sees all campuses
  ELSIF public.get_user_role() IN ('campus_head', 'campus_admin') THEN
    v_campus := public.get_user_campus();
  ELSE
    RAISE EXCEPTION 'Not authorized: campus_head/campus_admin/super_admin only';
  END IF;

  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY g.total_xp DESC, g.longest_streak DESC, up.full_name ASC)::bigint AS rank,
    g.user_id,
    up.full_name,
    g.total_xp,
    g.level,
    g.current_streak,
    (SELECT count(*)::bigint FROM public.user_achievements ua WHERE ua.user_id = g.user_id) AS achievements
  FROM public.gamification_profiles g
  JOIN public.user_profiles up ON up.id = g.user_id
  WHERE (v_campus IS NULL OR up.campus_id = v_campus)
    AND up.role IN ('new_joinee', 'lab_instructor')
  ORDER BY g.total_xp DESC, g.longest_streak DESC, up.full_name ASC
  LIMIT GREATEST(1, p_limit);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campus_leaderboard(integer) TO authenticated;

-- ─── 12. RLS policies ───────────────────────────────────────────────────────
ALTER TABLE public.gamification_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completion_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read gamification" ON public.gamification_profiles;
CREATE POLICY "Read gamification" ON public.gamification_profiles
  FOR SELECT USING (public.can_view_user_gamification(user_id));

DROP POLICY IF EXISTS "Read xp events" ON public.xp_events;
CREATE POLICY "Read xp events" ON public.xp_events
  FOR SELECT USING (public.can_view_user_gamification(user_id));

DROP POLICY IF EXISTS "Read achievements" ON public.user_achievements;
CREATE POLICY "Read achievements" ON public.user_achievements
  FOR SELECT USING (public.can_view_user_gamification(user_id));

DROP POLICY IF EXISTS "Read certificates" ON public.completion_certificates;
CREATE POLICY "Read certificates" ON public.completion_certificates
  FOR SELECT USING (public.can_view_user_gamification(user_id));

-- Writes are only ever performed by the SECURITY DEFINER trigger/RPCs above,
-- never by the client directly — so no INSERT/UPDATE policies are granted.

-- ─── 13. Grants ─────────────────────────────────────────────────────────────
GRANT SELECT ON public.gamification_profiles TO authenticated;
GRANT SELECT ON public.xp_events TO authenticated;
GRANT SELECT ON public.user_achievements TO authenticated;
GRANT SELECT ON public.completion_certificates TO authenticated;
