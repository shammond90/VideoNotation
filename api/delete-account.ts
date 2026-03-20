/**
 * Delete Account — permanently deletes a user's account and all associated data.
 *
 * Flow:
 *   1. Verify Clerk session token
 *   2. Fetch user email/name from Supabase (for farewell email)
 *   3. Delete Supabase user row (CASCADE removes all child data)
 *   4. Send farewell email via Resend
 *   5. Delete user from Clerk
 *
 * Required environment variables:
 *   CLERK_SECRET_KEY          — Clerk secret key for token verification + user deletion
 *   SUPABASE_URL              — project URL (server-side)
 *   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS, server-side only
 *   RESEND_API_KEY            — Resend API key for farewell email
 */
import { verifyToken } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { AccountDeletedEmail } from '../src/emails/AccountDeletedEmail';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // ── Verify Clerk session ────────────────────────────────────────────
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

  // ── Supabase setup ──────────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase environment variables not configured');
    return new Response('Server misconfigured', { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ── Fetch user info for farewell email ──────────────────────────────
  const { data: userRow } = await supabase
    .from('users')
    .select('email, name')
    .eq('id', userId)
    .single();

  const email = userRow?.email as string | undefined;
  const name = (userRow?.name as string) || null;

  // ── Delete from Supabase (CASCADE cleans up all child rows) ─────────
  const { error: deleteError } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);

  if (deleteError) {
    console.error('Supabase delete error:', deleteError);
    return new Response('Database error', { status: 500 });
  }

  // ── Send farewell email (non-blocking) ──────────────────────────────
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey && email) {
    try {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? 'Cuetation <noreply@cuetation.app>',
        to: email,
        subject: 'Your Cuetation account has been deleted',
        react: AccountDeletedEmail({ name }),
      });
    } catch (emailError) {
      console.error('Resend farewell email error:', emailError);
    }
  }

  // ── Delete from Clerk ───────────────────────────────────────────────
  try {
    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!clerkRes.ok) {
      console.error('Clerk user deletion failed:', clerkRes.status, await clerkRes.text());
    }
  } catch (clerkError) {
    console.error('Clerk user deletion error:', clerkError);
  }

  return new Response(JSON.stringify({ deleted: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
