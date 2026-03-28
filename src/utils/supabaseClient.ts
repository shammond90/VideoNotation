import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string;

/**
 * Create a Supabase client authenticated via Clerk's Third-Party Auth integration.
 * The accessToken callback provides Clerk session tokens which Supabase
 * verifies using Clerk's JWKS endpoint — no shared JWT secret needed.
 */
export function createSupabaseClient(
  accessToken: () => Promise<string | null>
): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    accessToken,
  });
}
