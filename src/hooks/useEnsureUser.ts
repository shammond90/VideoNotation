import { useEffect, useRef } from 'react';
import { useUser } from '@clerk/react';
import { useSupabase } from './useSupabase';

/**
 * Ensures the signed-in Clerk user has a row in the Supabase `users` table.
 * Runs once after sign-in. If the row already exists (e.g. from a webhook
 * in production), this is a no-op.
 *
 * This is the local-dev fallback for when webhooks can't reach localhost.
 */
export function useEnsureUser() {
  const { user, isSignedIn } = useUser();
  const supabase = useSupabase();
  const hasRun = useRef(false);

  useEffect(() => {
    if (!isSignedIn || !user || hasRun.current) return;
    hasRun.current = true;

    async function sync() {
      if (!user) return;

      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (existing) return; // Already synced

      const { error } = await supabase.from('users').insert({
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? '',
        name: user.fullName ?? '',
        tier: 'starter',
        subscription_status: 'active',
      });

      if (error) {
        console.error('[ensureUser] Failed to create Supabase row:', error);
      } else {
        console.log('[ensureUser] Created Supabase user row for', user.id);
      }
    }

    sync();
  }, [isSignedIn, user, supabase]);
}
