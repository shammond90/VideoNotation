import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';
import { createSupabaseClient } from '../utils/supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cacheAuthState, clearCachedAuth } from '../utils/authCache';

const SESSION_ID = crypto.randomUUID();
const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

interface AuthState {
  userId: string | null;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  sessionExpired: boolean;
}

export function useAuth() {
  const { getToken, signOut, isLoaded: authLoaded, isSignedIn } = useClerkAuth();
  const { user, isLoaded: userLoaded } = useUser();

  const [state, setState] = useState<AuthState>({
    userId: null,
    email: null,
    fullName: null,
    avatarUrl: null,
    isLoaded: false,
    isSignedIn: false,
    sessionExpired: false,
  });

  const heartbeatRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const initializedRef = useRef(false);

  // Keep a stable ref to getToken so the Supabase client's accessToken
  // callback always uses the latest Clerk function reference.
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  // Single cached Supabase client — uses Clerk session tokens via
  // the Third-Party Auth integration (no JWT template needed).
  const supabaseClientRef = useRef<SupabaseClient | null>(null);

  const getSupabaseClient = useCallback(async (): Promise<SupabaseClient> => {
    if (!supabaseClientRef.current) {
      supabaseClientRef.current = createSupabaseClient(
        async () => getTokenRef.current() ?? null
      );
    }
    return supabaseClientRef.current;
  }, []);

  /** Upsert user record and register session. */
  const initializeSession = useCallback(async () => {
    if (initializedRef.current) return;
    if (!user) return;

    try {
      const supabase = await getSupabaseClient();

      // Upsert user
      const { error: userError } = await supabase.from('users').upsert({
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? '',
        full_name: user.fullName ?? '',
        avatar_url: user.imageUrl ?? '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (userError) {
        console.error('Supabase user upsert failed:', userError.message, userError.code, userError.details);
        return;
      }

      // Register session (overwrites any previous session → kicks old device)
      const { error: sessionError } = await supabase.from('active_sessions').upsert({
        user_id: user.id,
        session_id: SESSION_ID,
        started_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (sessionError) {
        console.error('Supabase session upsert failed:', sessionError.message, sessionError.code, sessionError.details);
        return;
      }

      initializedRef.current = true;
    } catch (err) {
      console.error('Failed to initialize session:', err);
    }
  }, [user, getSupabaseClient]);

  /** Check if this session is still the active one. */
  const validateSession = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    if (!initializedRef.current) return true; // session not registered yet — don't block
    try {
      const supabase = await getSupabaseClient();
      const { data } = await supabase
        .from('active_sessions')
        .select('session_id')
        .eq('user_id', user.id)
        .single();

      if (data && data.session_id !== SESSION_ID) {
        setState(prev => ({ ...prev, sessionExpired: true }));
        return false;
      }
      return true;
    } catch {
      // Network error — don't expire session, just skip
      return true;
    }
  }, [user, getSupabaseClient]);

  /** Heartbeat: update last_seen_at and validate session. */
  const heartbeat = useCallback(async () => {
    if (!user) return;
    try {
      const supabase = await getSupabaseClient();
      // Update heartbeat
      await supabase
        .from('active_sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('session_id', SESSION_ID);

      // Validate session is still ours
      await validateSession();
    } catch {
      // Network errors don't expire session
    }
  }, [user, getSupabaseClient, validateSession]);

  // Initialize on auth load
  useEffect(() => {
    if (!authLoaded || !userLoaded) return;

    if (isSignedIn && user) {
      setState({
        userId: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? null,
        fullName: user.fullName ?? null,
        avatarUrl: user.imageUrl ?? null,
        isLoaded: true,
        isSignedIn: true,
        sessionExpired: false,
      });
      cacheAuthState({
        userId: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? null,
        fullName: user.fullName ?? null,
        avatarUrl: user.imageUrl ?? null,
      });
      initializeSession();
    } else {
      setState({
        userId: null,
        email: null,
        fullName: null,
        avatarUrl: null,
        isLoaded: true,
        isSignedIn: false,
        sessionExpired: false,
      });
      initializedRef.current = false;
    }
  }, [authLoaded, userLoaded, isSignedIn, user, initializeSession]);

  // Start heartbeat after initialization
  useEffect(() => {
    if (!initializedRef.current) return;

    heartbeatRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    return () => clearInterval(heartbeatRef.current);
  }, [heartbeat, state.isSignedIn]);

  const handleSessionExpiredSignOut = useCallback(async () => {
    setState(prev => ({ ...prev, sessionExpired: false }));
    await clearCachedAuth();
    await signOut();
  }, [signOut]);

  return {
    ...state,
    sessionId: SESSION_ID,
    getSupabaseClient,
    validateSession,
    signOut: handleSessionExpiredSignOut,
  };
}
