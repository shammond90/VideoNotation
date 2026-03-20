/**
 * Set Experience Level — updates the user's tier in Supabase.
 *
 * Vercel Node.js Serverless Function.
 *
 * Required environment variables:
 *   CLERK_SECRET_KEY          — Clerk secret key for token verification
 *   SUPABASE_URL              — project URL (server-side)
 *   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS, server-side only
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';

const VALID_LEVELS = ['beginner', 'advanced', 'expert'] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify the Clerk session
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    console.error('CLERK_SECRET_KEY not configured');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const authHeader = req.headers['authorization'] as string | undefined;
  const sessionToken = authHeader?.replace('Bearer ', '');

  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  let userId: string;
  try {
    const payload = await verifyToken(sessionToken, { secretKey: clerkSecretKey });
    userId = payload.sub;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Validate the level — req.body is auto-parsed by Vercel
  const { level } = req.body as { level?: string };

  if (!level || !VALID_LEVELS.includes(level as (typeof VALID_LEVELS)[number])) {
    return res.status(400).json({ error: 'Invalid level' });
  }

  // Update Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase environment variables not configured');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase
    .from('users')
    .update({ tier: level, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    console.error('Supabase update error:', error);
    return res.status(500).json({ error: 'Database error' });
  }

  // Sync tier to Clerk publicMetadata (convenience cache for client reads)
  try {
    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        public_metadata: { tier: level },
      }),
    });
    if (!clerkRes.ok) {
      console.warn('Clerk publicMetadata sync failed:', clerkRes.status, await clerkRes.text());
    }
  } catch (metaError) {
    console.warn('Clerk publicMetadata sync error:', metaError);
  }

  return res.status(200).json({ tier: level });
}
