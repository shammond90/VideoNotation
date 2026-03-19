/**
 * Set Experience Level — updates the user's tier in Supabase.
 *
 * Platform-agnostic: uses Web Standard Request/Response API.
 * Works on both Vercel (`api/set-experience-level.ts`) and Netlify (`netlify/functions/`).
 *
 * Required environment variables:
 *   CLERK_SECRET_KEY          — Clerk secret key for token verification
 *   SUPABASE_URL              — project URL (server-side)
 *   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS, server-side only
 */
import { verifyToken } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';

const VALID_LEVELS = ['beginner', 'advanced', 'expert'] as const;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verify the Clerk session
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    console.error('CLERK_SECRET_KEY not configured');
    return new Response('Server misconfigured', { status: 500 });
  }

  const sessionToken = req.headers.get('Authorization')?.replace('Bearer ', '');

  if (!sessionToken) {
    return new Response('Unauthorised', { status: 401 });
  }

  let userId: string;
  try {
    const payload = await verifyToken(sessionToken, { secretKey: clerkSecretKey });
    userId = payload.sub;
  } catch {
    return new Response('Invalid token', { status: 401 });
  }

  // Validate the level
  const body = (await req.json()) as { level?: string };
  const { level } = body;

  if (!level || !VALID_LEVELS.includes(level as (typeof VALID_LEVELS)[number])) {
    return new Response('Invalid level', { status: 400 });
  }

  // Update Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase environment variables not configured');
    return new Response('Server misconfigured', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase
    .from('users')
    .update({ tier: level, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    console.error('Supabase update error:', error);
    return new Response('Database error', { status: 500 });
  }

  return new Response(JSON.stringify({ tier: level }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
