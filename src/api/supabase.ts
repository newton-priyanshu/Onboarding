import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let supabaseClient: SupabaseClient;
export let supabaseInitialized = true;

// ── Recursive Proxy for uninitialized client ────────────────
// Returns a Proxy for every property access, throws clear error on function call.
// Handles chains like: supabase.auth.getSession(), supabase.from('x').select('*')
function createThrowProxy(path: string, message: string): Record<string, unknown> {
  return new Proxy(function() {} as unknown as Record<string, unknown>, {
    get(_target, prop: string | symbol) {
      return createThrowProxy(`${path}.${String(prop)}`, message);
    },
    apply(_target, _thisArg, args: unknown[]) {
      throw new Error(`${message}\nCalled: ${path}(${args.map(a => JSON.stringify(a)).join(', ')})`);
    },
  });
}

function createSupabaseErrorProxy(message: string): SupabaseClient {
  return new Proxy({} as unknown as SupabaseClient, {
    get(_target, prop: string | symbol) {
      return createThrowProxy(`supabase.${String(prop)}`, message);
    },
  });
}

if (!supabaseUrl || !supabaseKey) {
  supabaseInitialized = false;
  console.error(
    '%c⚠️ Supabase environment variables missing!\n' +
    '%cCreate a .env file in the project root with:\n' +
    '  VITE_SUPABASE_URL=https://your-project-id.supabase.co\n' +
    '  VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key\n' +
    'See .env.example for reference.',
    'color: #C62828; font-weight: bold; font-size: 1rem;',
    'color: #666; font-size: 0.85rem;'
  );
  supabaseClient = createSupabaseErrorProxy(
    'Supabase client is not initialized. VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set in .env.'
  );
} else {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  } catch (err) {
    supabaseInitialized = false;
    console.error('%cSupabase client initialization failed:', 'color: #C62828; font-weight: bold;', err);
    supabaseClient = createSupabaseErrorProxy(
      'Supabase client failed to initialize. Check that credentials are valid.'
    );
  }
}

export const supabase: SupabaseClient = supabaseClient!;

/**
 * withCampus — Chainable query helper that auto-filters by campus_id.
 *
 * Usage:
 *   const rows = await withCampus(supabase.from('worksheet_submissions').select('*'), campusId);
 *   // Equivalent to: supabase.from('worksheet_submissions').select('*').eq('campus_id', campusId)
 *
 * This is a convenience helper. The PRIMARY campus isolation mechanism is RLS,
 * so this helper is optional for most queries — RLS will filter by campus_id
 * from the JWT automatically. Use this helper when:
 *   - You need to query data for a SPECIFIC campus (e.g. admin views)
 *   - The query context differs from the logged-in user's campus (e.g. super admin)
 *   - You want explicit, readable filtering in the query chain
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseQuery = any;

/**
 * withCampus — Chainable query helper that auto-filters by campus_id.
 *
 * Usage:
 *   const rows = await withCampus(supabase.from('worksheet_submissions').select('*'), campusId);
 *
 * RLS is the PRIMARY campus isolation mechanism — this helper is optional.
 * Use it when you need to query for a specific campus explicitly.
 */
export function withCampus(query: SupabaseQuery, campusId: string): SupabaseQuery {
  return query.eq('campus_id', campusId);
}

/**
 * withCampusIf — Conditionally apply campus filter.
 * Only adds the filter if campusId is provided (non-null, non-empty).
 */
export function withCampusIf(query: SupabaseQuery, campusId: string | null | undefined): SupabaseQuery {
  if (!campusId) return query;
  return withCampus(query, campusId);
}

