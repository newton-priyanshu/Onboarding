import { createClient } from '@supabase/supabase-js';
import { notifyError } from '../utils/errorHandling';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  notifyError('Supabase environment variables are missing. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
