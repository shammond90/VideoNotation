/**
 * Clerk Webhook Handler — creates Supabase user record on `user.created`
 * and sends a welcome email via Resend.
 *
 * Vercel Node.js Serverless Function.
 * Body parser is disabled so we can read the raw body for svix signature verification.
 *
 * Required environment variables:
 *   CLERK_WEBHOOK_SECRET      — signing secret from Clerk dashboard
 *   SUPABASE_URL              — project URL (server-side, not VITE_ prefixed)
 *   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS, server-side only
 *   RESEND_API_KEY            — Resend API key for transactional emails
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Webhook } from 'svix';
import { createClient } from '@supabase/supabase-js';

// Disable Vercel's automatic body parsing — svix needs the raw body string
export const config = {
  api: { bodyParser: false },
};

/** Read the raw request body as a UTF-8 string. */
function getRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify webhook signature
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('CLERK_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const rawBody = await getRawBody(req);

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

  try {
    event = webhook.verify(rawBody, {
      'svix-id': req.headers['svix-id'] as string ?? '',
      'svix-timestamp': req.headers['svix-timestamp'] as string ?? '',
      'svix-signature': req.headers['svix-signature'] as string ?? '',
    }) as typeof event;
  } catch {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Only handle user creation
  if (event.type !== 'user.created') {
    return res.status(200).json({ received: true });
  }

  const { id, email_addresses, first_name, last_name } = event.data;
  const email = email_addresses?.[0]?.email_address;
  const name = [first_name, last_name].filter(Boolean).join(' ') || null;

  if (!email) {
    return res.status(400).json({ error: 'No email address' });
  }

  // Service role key — bypasses RLS, safe server-side only
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase environment variables not configured');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Upsert is idempotent — safe if webhook fires twice for the same user
  const { error } = await supabase
    .from('users')
    .upsert({ id, email, name, tier: 'starter' }, { onConflict: 'id' });

  if (error) {
    console.error('Supabase upsert error:', error);
    return res.status(500).json({ error: 'Database error' });
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
      console.error('Resend welcome email error:', emailError);
    }
  } else {
    console.warn('RESEND_API_KEY not configured — skipping welcome email');
  }

  return res.status(200).json({ received: true });
}

// ── Inline email HTML ───────────────────────────────────────────────

function buildWelcomeHtml(name: string): string {
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
          <h2 style="font-size:22px;font-weight:600;color:#ede9e3;margin:0 0 16px">Welcome to Cuetation</h2>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 12px">Hey ${name},</p>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 12px">
            Thanks for signing up. Cuetation is a purpose-built tool for stage managers to annotate, track, and export video cues for live productions.
          </p>
          <hr style="border:none;border-top:1px solid #2a2a2e;margin:20px 0">
          <p style="font-size:15px;font-weight:600;color:#ede9e3;margin:0 0 12px">What you can do right away</p>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 8px;padding-left:8px">
            <strong style="color:#BF5700">Create a project</strong> &mdash; set up a show with custom cue types, fields, and video
          </p>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 8px;padding-left:8px">
            <strong style="color:#BF5700">Annotate video</strong> &mdash; place cues on a timeline with timecodes, statuses, and notes
          </p>
          <p style="font-size:14px;line-height:1.6;color:#b0aca4;margin:0 0 8px;padding-left:8px">
            <strong style="color:#BF5700">Export</strong> &mdash; generate PDF, CSV, or XLSX reports for your production team
          </p>
          <hr style="border:none;border-top:1px solid #2a2a2e;margin:20px 0">
          <p style="font-size:14px;line-height:1.6;color:#6b6b6b;margin:0">Break a leg,<br>The Cuetation Team</p>
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
