import type { PostgrestError } from '@supabase/supabase-js';

/**
 * unwrap — supabase-js never throws; every call returns `{ data, error }`.
 * This helper throws the Postgrest error (if any) so callers can rely on
 * normal try/catch control flow instead of silently treating a failed
 * query the same as "no rows" (see production-readiness audit finding H18).
 *
 * Usage:
 *   const rows = await supabase.from('t').select('*').then(unwrap);
 */
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) throw res.error;
  // For non-.single()/.maybeSingle() reads, Supabase only returns a null
  // `data` alongside a non-null `error` — so if we get here, data is safe.
  return res.data as T;
}
