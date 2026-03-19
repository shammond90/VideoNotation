/**
 * Forgot password screen using Clerk's useSignIn hook.
 * Sends a reset code via email, then lets user enter new password.
 */
import { useSignIn } from '@clerk/react';
import { useState } from 'react';
import { AuthLayout } from './AuthLayout';

interface ForgotPasswordScreenProps {
  onBackToSignIn: () => void;
}

export function ForgotPasswordScreen({ onBackToSignIn }: ForgotPasswordScreenProps) {
  const { signIn, setActive, isLoaded } = useSignIn();

  const [stage, setStage] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Step 1: Request reset code
  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setLoading(true);
    setError(null);

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      setStage('reset');
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ message: string }> };
      setError(clerkErr.errors?.[0]?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Submit code + new password
  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setLoading(true);
    setError(null);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: newPassword,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        // Clerk's <Show when="signed-in"> will take over
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: Array<{ message: string }> };
      setError(clerkErr.errors?.[0]?.message || 'Invalid code or password');
    } finally {
      setLoading(false);
    }
  }

  // ── Reset stage: enter code + new password ──
  if (stage === 'reset') {
    return (
      <AuthLayout>
        <h1
          className="font-display text-center mb-2"
          style={{ fontSize: 22, fontWeight: 400, color: 'var(--text)' }}
        >
          Reset your password
        </h1>
        <p
          className="font-mono text-center mb-6"
          style={{ fontSize: 12, color: 'var(--text-dim)' }}
        >
          Enter the code sent to {email} and your new password.
        </p>
        <form onSubmit={handleResetPassword} className="space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Reset code"
            maxLength={6}
            autoFocus
            className="w-full px-3 py-2.5 rounded font-mono text-sm text-center outline-none tracking-[0.3em]"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: 18,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            required
            autoComplete="new-password"
            className="w-full px-3 py-2.5 rounded font-mono text-sm outline-none transition-colors"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />

          {error && (
            <p className="font-mono text-xs" style={{ color: 'var(--red)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 rounded font-mono text-sm font-medium cursor-pointer transition-colors"
            style={{
              background: 'var(--amber)',
              color: 'var(--text-inv)',
              border: 'none',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            onClick={onBackToSignIn}
            className="font-mono text-xs cursor-pointer transition-colors"
            style={{ color: 'var(--text-mid)', background: 'none', border: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--amber)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-mid)')}
          >
            Back to sign in
          </button>
        </div>
      </AuthLayout>
    );
  }

  // ── Email stage: request reset code ──
  return (
    <AuthLayout>
      <h1
        className="font-display text-center mb-2"
        style={{ fontSize: 22, fontWeight: 400, color: 'var(--text)' }}
      >
        Forgot your password?
      </h1>
      <p
        className="font-mono text-center mb-6"
        style={{ fontSize: 12, color: 'var(--text-dim)' }}
      >
        Enter your email and we'll send a reset code.
      </p>
      <form onSubmit={handleRequestCode} className="space-y-3">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
          className="w-full px-3 py-2.5 rounded font-mono text-sm outline-none transition-colors"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />

        {error && (
          <p className="font-mono text-xs" style={{ color: 'var(--red)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2.5 rounded font-mono text-sm font-medium cursor-pointer transition-colors"
          style={{
            background: 'var(--amber)',
            color: 'var(--text-inv)',
            border: 'none',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Sending…' : 'Send reset code'}
        </button>
      </form>

      <div className="mt-5 text-center">
        <button
          onClick={onBackToSignIn}
          className="font-mono text-xs cursor-pointer transition-colors"
          style={{ color: 'var(--text-mid)', background: 'none', border: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--amber)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-mid)')}
        >
          Back to sign in
        </button>
      </div>
    </AuthLayout>
  );
}
