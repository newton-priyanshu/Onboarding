-- =============================================================================
-- Migration: get_buddy_manager_names RPC — SECURITY DEFINER, lets any
-- authenticated user fetch the full_name + email of their assigned buddy
-- and/or manager (or any user IDs) without hitting RLS. This is needed
-- because the "Select own profile" policy restricts users to reading only
-- their own row, while a joinee needs to see who their buddy/manager are.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_buddy_manager_names(p_user_ids uuid[])
RETURNS TABLE (
  id uuid,
  full_name text,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT up.id, up.full_name, up.email
  FROM public.user_profiles up
  WHERE up.id = ANY (p_user_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_buddy_manager_names(uuid[]) TO authenticated;
