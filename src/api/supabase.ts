import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '%c⚠️ Supabase environment variables missing!\n' +
    '%cCreate a .env file in the project root with:\n' +
    '  VITE_SUPABASE_URL=https://your-project-id.supabase.co\n' +
    '  VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key\n' +
    'See .env.example for reference.',
    'color: #C62828; font-weight: bold; font-size: 1rem;',
    'color: #666; font-size: 0.85rem;'
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
