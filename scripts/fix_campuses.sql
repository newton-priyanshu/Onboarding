-- =============================================================================
-- Fix: SECURITY DEFINER RPC for public campus reads + seed default campus
-- =============================================================================
-- Run this in Supabase SQL Editor to fix the signup page "No campuses available" issue.
-- =============================================================================

-- ── 1. SECURITY DEFINER RPC ─────────────────────────────────────────────
-- Bypasses RLS so anonymous users (signup page) can list campuses.
CREATE OR REPLACE FUNCTION public.get_active_campuses()
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
  INTO result
  FROM (
    SELECT id, name, slug, domain, is_active, branding, created_at, updated_at
    FROM public.campuses
    WHERE is_active = TRUE
    ORDER BY name
  ) c;
  RETURN result;
END;
$$;

-- Grant execute to all users (anonymous + authenticated)
GRANT EXECUTE ON FUNCTION public.get_active_campuses() TO PUBLIC;

-- ── 2. Fix RLS policies ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Super admin manage campuses" ON public.campuses;
DROP POLICY IF EXISTS "Users can read active campuses" ON public.campuses;

CREATE POLICY "Super admin manage campuses" ON public.campuses
  FOR ALL USING (public.is_super_admin());

-- Anyone (including anon) can read active campuses
CREATE POLICY "Anyone can read active campuses" ON public.campuses
  FOR SELECT USING (is_active = TRUE OR public.is_super_admin());

-- ── 3. Seed default campus if missing ────────────────────────────────────
INSERT INTO public.campuses (name, slug, domain, branding)
SELECT 'Default Campus', 'default', NULL,
  '{"name":"NST BLR · AARAMBH","theme_color":"#D4A853","welcome_message":"Welcome to NST BLR · AARAMBH"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.campuses WHERE slug = 'default');

-- ── 4. Seed default template if missing ──────────────────────────────────
DO $$
DECLARE
  v_campus_id uuid;
  v_tmpl_exists boolean;
BEGIN
  SELECT id INTO v_campus_id FROM public.campuses WHERE slug = 'default';
  IF v_campus_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (SELECT 1 FROM public.onboarding_templates WHERE is_default = TRUE) INTO v_tmpl_exists;
  IF NOT v_tmpl_exists THEN
    INSERT INTO public.onboarding_templates (campus_id, name, description, structure, approval_chain, is_active, is_default)
    VALUES (v_campus_id, 'Default Onboarding', 'Standard NST onboarding programme', '{}'::jsonb, '["lead_instructor","academic_head"]'::jsonb, TRUE, TRUE);
  END IF;
END $$;
