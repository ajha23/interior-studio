/**
 * The code step of email sign-in (spec 054, User Story 1, FR-003): enter the 6-digit code from the
 * email, resend after the 60-second interval, or go back and use a different address. Supabase Auth
 * enforces the interval and the attempt limits; the countdown only mirrors them.
 */
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EmailResult } from './sessionContext';

const RESEND_INTERVAL_MS = 60_000; // max_frequency = 60s (research R5)

const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 6);

export function EmailCodeForm({
  email,
  sentAt,
  onVerify,
  onResend,
  onChangeEmail,
}: {
  email: string;
  /** When the current email was sent (ms since epoch); starts the resend countdown. */
  sentAt: number;
  onVerify: (code: string) => Promise<EmailResult>;
  onResend: () => Promise<EmailResult>;
  onChangeEmail: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(sentAt + RESEND_INTERVAL_MS);
  const [now, setNow] = useState(() => Date.now());
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => field.current?.focus(), []);

  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (waitSeconds === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waitSeconds]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setProblem('Enter the 6-digit code from the email.');
      return;
    }
    setBusy('verify');
    setProblem(null);
    const result = await onVerify(code);
    setBusy(null);
    if (!result.ok) {
      setProblem(result.message);
      field.current?.focus();
    }
  };

  const resend = async () => {
    setBusy('resend');
    setProblem(null);
    const result = await onResend();
    setBusy(null);
    const at = Date.now();
    setNow(at);
    if (result.ok) {
      setCode('');
      setResendAt(at + RESEND_INTERVAL_MS);
    } else {
      setProblem(result.message);
      if (result.retryAfterSeconds) setResendAt(at + result.retryAfterSeconds * 1000);
    }
  };

  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setCode(digitsOnly(e.clipboardData.getData('text')));
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-3">
      <p role="status" className="text-sm">
        We sent a code to <span className="font-medium">{email}</span>. It works for 15 minutes.
      </p>
      {problem && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {problem}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="signin-code">6-digit code</Label>
        <Input
          ref={field}
          id="signin-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(digitsOnly(e.target.value))}
          onPaste={paste}
          className="text-center font-mono text-lg tracking-[0.4em]"
        />
      </div>
      <Button type="submit" disabled={busy !== null}>
        {busy === 'verify' ? 'Signing in…' : 'Sign in'}
      </Button>
      <div className="flex items-center justify-between gap-2 text-sm">
        <Button type="button" variant="ghost" size="sm" onClick={onChangeEmail} disabled={busy !== null}>
          Use a different email
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void resend()} disabled={busy !== null || waitSeconds > 0}>
          {waitSeconds > 0 ? `Resend in ${waitSeconds} s` : busy === 'resend' ? 'Sending…' : 'Resend email'}
        </Button>
      </div>
    </form>
  );
}
