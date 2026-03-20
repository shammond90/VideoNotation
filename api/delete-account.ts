/**
 * Delete Account — permanently deletes a user's account and all associated data.
 *
 * Vercel Node.js Serverless Function.
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
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Verify Clerk session ────────────────────────────────────────────
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

  // ── Supabase setup ──────────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase environment variables not configured');
    return res.status(500).json({ error: 'Server misconfigured' });
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
    return res.status(500).json({ error: 'Database error' });
  }

  // ── Send farewell email via Resend REST API (non-blocking) ──────────
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey && email) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL ?? 'Cuetation <noreply@cuetation.app>',
          reply_to: process.env.RESEND_REPLY_TO ?? undefined,
          to: email,
          subject: 'Your Cuetation account has been deleted',
          html: buildAccountDeletedHtml(name ?? 'there'),
        }),
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

  return res.status(200).json({ deleted: true });
}

// ── Inline email HTML ───────────────────────────────────────────────

function buildAccountDeletedHtml(name: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#141416;font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#141416;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding-bottom:32px">
          <span style="font-size:28px;font-weight:400;letter-spacing:-0.03em;color:#ede9e3">Cue<span style="color:#BF5700;font-style:italic">tation</span></span>
        </td></tr>
        <tr><td style="background:#1c1c1f;border-radius:8px;border:1px solid #2a2a2e;padding:32px 28px">
          <h2 style="font-size:22px;font-weight:600;color:#ede9e3;margin:0 0 16px">Account Deleted</h2>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 12px">Hey ${name},</p>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 12px">
            Your Cuetation account and all associated data have been permanently deleted as requested.
            This includes all projects, cues, templates, and settings.
          </p>
          <hr style="border:none;border-top:1px solid #2a2a2e;margin:20px 0">
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 12px">
            If this was a mistake or you'd like to return in the future, you're always welcome to create a new account.
          </p>
          <p style="font-size:14px;line-height:1.6;color:#6b6b6b;margin:0">All the best,<br>The Cuetation Team</p>
        </td></tr>
        <tr><td align="center" style="padding-top:24px">
          <span style="color:#6b6b6b;font-size:12px;font-family:'DM Mono',monospace">
            &copy; ${new Date().getFullYear()} Cuetation &middot; Video cue annotation for stage managers
          </span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
