/**
 * Clerk Webhook Handler — creates Supabase user record on `user.created`
 * and sends a welcome email via Resend.
 *
 * Vercel Edge Runtime — uses Web Standard Request/Response API.
 *
 * Required environment variables:
 *   CLERK_WEBHOOK_SECRET      — signing secret from Clerk dashboard
 *   SUPABASE_URL              — project URL (server-side, not VITE_ prefixed)
 *   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS, server-side only
 *   RESEND_API_KEY            — Resend API key for transactional emails
 */
export const config = { runtime: 'edge' };

import { Webhook } from 'svix';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: Request): Promise<Response> {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verify webhook signature
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('CLERK_WEBHOOK_SECRET not configured');
    return new Response('Server misconfigured', { status: 500 });
  }

  const webhook = new Webhook(webhookSecret);
  let event: {
    type: string;
    data: {
      id: string;
      email_addresses?: Array<{ email_address: string }>;
      first_name?: string | null;
      last_name?: string | null;
    };
  };

  const body = await req.text();

  try {
    event = webhook.verify(body, {
      'svix-id': req.headers.get('svix-id') ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    }) as typeof event;
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  // Only handle user creation
  if (event.type !== 'user.created') {
    return new Response('OK', { status: 200 });
  }

  const { id, email_addresses, first_name, last_name } = event.data;
  const email = email_addresses?.[0]?.email_address;
  const name = [first_name, last_name].filter(Boolean).join(' ') || null;

  if (!email) {
    return new Response('No email address', { status: 400 });
  }

  // Service role key — bypasses RLS, safe server-side only
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase environment variables not configured');
    return new Response('Server misconfigured', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Upsert is idempotent — safe if webhook fires twice for the same user
  const { error } = await supabase
    .from('users')
    .upsert({ id, email, name, tier: 'starter' }, { onConflict: 'id' });

  if (error) {
    console.error('Supabase upsert error:', error);
    return new Response('Database error', { status: 500 });
  }

  // Send welcome email via Resend REST API (non-blocking — don't fail the webhook)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
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
          subject: 'Welcome to Cuetation',
          html: buildWelcomeHtml(name ?? 'there'),
        }),
      });
    } catch (emailError) {
      // Log but don't fail the webhook — the user was still created
      console.error('Resend welcome email error:', emailError);
    }
  } else {
    console.warn('RESEND_API_KEY not configured — skipping welcome email');
  }

  return new Response('OK', { status: 200 });
}

// ── Inline email HTML (avoids bundling React Email in Edge runtime) ──

function buildWelcomeHtml(name: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#141416;font-family:Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#141416;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding-bottom:32px">
          <span style="font-size:28px;font-weight:400;letter-spacing:-0.03em;color:#ede9e3">Cue<span style="color:#BF5700;font-style:italic">tation</span></span>
        </td></tr>
        <tr><td style="background:#1c1c1f;border-radius:8px;border:1px solid #2a2a2e;padding:32px 28px">
          <h2 style="font-size:22px;font-weight:600;color:#ede9e3;margin:0 0 16px">Welcome to Cuetation</h2>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 12px">Hey ${name},</p>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 12px">
            Thanks for signing up. Cuetation is a purpose-built tool for stage managers to annotate, track, and export video cues for live productions.
          </p>
          <hr style="border:none;border-top:1px solid #2a2a2e;margin:20px 0">
          <p style="font-size:15px;font-weight:600;color:#ede9e3;margin:0 0 12px">What you can do right away</p>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 8px;padding-left:8px">
            <strong style="color:#BF5700">Create a project</strong> \u2014 set up a show with custom cue types, fields, and video
          </p>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 8px;padding-left:8px">
            <strong style="color:#BF5700">Annotate video</strong> \u2014 place cues on a timeline with timecodes, statuses, and notes
          </p>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 8px;padding-left:8px">
            <strong style="color:#BF5700">Export</strong> \u2014 generate PDF, CSV, or XLSX reports for your production team
          </p>
          <hr style="border:none;border-top:1px solid #2a2a2e;margin:20px 0">
          <p style="font-size:14px;line-height:1.6;color:#6b6b6b;margin:0">Break a leg,<br>The Cuetation Team</p>
        </td></tr>
        <tr><td align="center" style="padding-top:24px">
          <span style="color:#6b6b6b;font-size:12px;font-family:'DM Mono',monospace">
            \u00a9 ${new Date().getFullYear()} Cuetation \u00b7 Video cue annotation for stage managers
          </span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
