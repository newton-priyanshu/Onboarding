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

