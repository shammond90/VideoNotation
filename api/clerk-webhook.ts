/**
 * Clerk Webhook Handler — creates Supabase user record on `user.created`
 * and sends a welcome email via Resend.
 *
 * Platform-agnostic: uses Web Standard Request/Response API.
 * Works on both Vercel (`api/clerk-webhook.ts`) and Netlify (`netlify/functions/`).
 *
 * Required environment variables:
 *   CLERK_WEBHOOK_SECRET      — signing secret from Clerk dashboard
 *   SUPABASE_URL              — project URL (server-side, not VITE_ prefixed)
 *   SUPABASE_SERVICE_ROLE_KEY — bypasses RLS, server-side only
 *   RESEND_API_KEY            — Resend API key for transactional emails
 */
import { Webhook } from 'svix';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { WelcomeEmail } from '../src/emails/WelcomeEmail';

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

  // Send welcome email via Resend (non-blocking — don't fail the webhook)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? 'Cuetation <noreply@cuetation.app>',
        to: email,
        subject: 'Welcome to Cuetation',
        react: WelcomeEmail({ name }),
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
