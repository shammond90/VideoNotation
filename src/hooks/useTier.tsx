import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useUser } from '@clerk/react';
import { useSupabase } from './useSupabase';
import type { UserTier } from '../config/tierLimits';
import { TIER_LIMITS, type TierLimits } from '../config/tierLimits';

const LOCAL_STORAGE_KEY = 'cuetation:userTier';

/** Read cached tier from localStorage (returns null if not set). */
function getCachedTier(): UserTier | null {
  try {
    const val = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (val === 'starter' || val === 'beginner' || val === 'advanced' || val === 'expert') {
      return val;
    }
  } catch { /* localStorage unavailable */ }
  return null;
}

/** Write tier to localStorage. */
function setCachedTier(tier: UserTier) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, tier);
  } catch { /* localStorage unavailable */ }
}

interface TierContextValue {
  tier: UserTier;
  limits: TierLimits;
  isLoading: boolean;
  /** Persist a new tier to Supabase (+ local cache) and update local state. */
  updateTier: (newTier: UserTier) => Promise<void>;
}

const TierContext = createContext<TierContextValue | null>(null);

/**
 * Provides the current user's experience tier to the component tree.
 * Must be rendered inside `<Show when="signed-in">`.
 *
 * Uses localStorage as the primary source so the UI is never blocked.
 * Syncs with Supabase in the background when available.
 */
export function TierProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const supabase = useSupabase();

  // Initialise from cache — never starts in a "loading" state that blocks UI
  const cached = getCachedTier();
  const [tier, setTier] = useState<UserTier>(cached ?? 'starter');
  // isLoading only true when we have NO cached tier (first-ever visit)
  const [isLoading, setIsLoading] = useState(cached === null);

  const supabaseRef = useRef(supabase);
  supabaseRef.current = supabase;

  // Background sync: fetch tier from Supabase and reconcile with local cache
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function syncTier() {
      try {
        // Race the fetch against a 5-second timeout
        const result = await Promise.race([
          supabaseRef.current
            .from('users')
            .select('tier')
            .eq('id', user!.id)
            .single(),
          new Promise<{ data: null; error: { message: string } }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: { message: 'Timeout after 5 s' } }), 5000),
          ),
        ]);

        if (cancelled) return;

        if (result.error) {
          console.warn('[TierProvider] Could not fetch tier from Supabase:', result.error.message);
          // Keep whatever we have (cache or 'starter')
        } else if (result.data) {
          const remoteTier = (result.data as { tier: string }).tier as UserTier;
          setTier(remoteTier);
          setCachedTier(remoteTier);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[TierProvider] Unexpected error:', e);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    syncTier();
    return () => { cancelled = true; };
  }, [user]);

  const updateTier = useCallback(
    async (newTier: UserTier) => {
      // Always update local state + cache immediately (optimistic)
      setTier(newTier);
      setCachedTier(newTier);

      // Best-effort sync to Supabase
      if (!user) return;
      try {
        const { error } = await Promise.race([
          supabaseRef.current
            .from('users')
            .update({ tier: newTier, updated_at: new Date().toISOString() })
            .eq('id', user.id),
          new Promise<{ error: { message: string } }>((resolve) =>
            setTimeout(() => resolve({ error: { message: 'Timeout' } }), 5000),
          ),
        ]);
        if (error) {
          console.warn('[TierProvider] Could not persist tier to Supabase:', error.message);
          // Don't throw — the local state is already updated
        }
      } catch (e) {
        console.warn('[TierProvider] Failed to persist tier:', e);
      }
    },
    [user],
  );

  return (
    <TierContext.Provider
      value={{
        tier,
        limits: TIER_LIMITS[tier],
        isLoading,
        updateTier,
      }}
    >
      {children}
    </TierContext.Provider>
  );
}

/**
 * Access the current user's experience tier, limits, and update function.
 * Must be used inside `<TierProvider>`.
 */
export function useTier(): TierContextValue {
  const ctx = useContext(TierContext);
  if (!ctx) {
    throw new Error('useTier must be used inside <TierProvider>');
  }
  return ctx;
}
