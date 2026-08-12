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

/**
 * fetchAllPages — paginate through a supabase query with .range() so bulk
 * reads never silently truncate (audit findings H34/H36: dashboard queries
 * were capped at 1000–2000 rows while the table can exceed that at scale).
 *
 * Usage — pass a function that builds the query for a given [from, to] range:
 *
 *   const rows = await fetchAllPages((from, to) =>
 *     supabase.from('worksheet_submissions').select('*').order('updated_at').range(from, to),
 *     1000,
 *   );
 *
 * The pageSize is the maximum rows per request (Supabase caps at 1000).
 * Throws the Postgrest error if any page fails. Stops early when a page
 * returns fewer rows than the page size (i.e. we've reached the end).
 */
export async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const res = await buildPage(from, from + pageSize - 1);
    if (res.error) throw res.error;
    const rows = (res.data as T[]) || [];
    all.push(...rows);
    if (rows.length < pageSize) break; // last (or empty) page — done
    from += pageSize;
    // Safety valve: never loop unbounded if a backend misreports page size.
    if (from > 100_000) break;
  }
  return all;
}
