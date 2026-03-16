import { useSession } from '@clerk/react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Returns a Supabase client authenticated with the current Clerk session.
 *
 * Uses the default Clerk session token (NOT a JWT template).
 * Supabase is configured to trust Clerk as a native third-party auth provider.
 *
 * Pattern follows the official Clerk + Supabase docs exactly:
 * @see https://clerk.com/docs/guides/development/integrations/databases/supabase
 */
export function useSupabase() {
  const { session } = useSession();

  return createClient(supabaseUrl, supabaseAnonKey, {
    async accessToken() {
      return session?.getToken() ?? null;
    },
  });
}
