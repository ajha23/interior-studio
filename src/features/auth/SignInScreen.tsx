/**
 * The only screen a signed-out visitor sees (spec 042, User Story 1; spec 054). Everyone can continue
 * with Google or get a sign-in email with a link and a 6-digit code. The password form appears only
 * in local and test builds where password sign-in is enabled (never in production, 054 FR-012).
 */
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmailCodeForm } from './EmailCodeForm';
import { authErrorFromUrl, clearPendingEmail, readPendingEmail } from './returnTo';
import { useSession } from './useSession';

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = { name: 'choose' } | { name: 'code-sent'; email: string; sentAt: number };

function initialStep(): Step {
  const pending = readPendingEmail();
  return pending ? { name: 'code-sent', email: pending, sentAt: Date.now() } : { name: 'choose' };
}

export function SignInScreen() {
  const { signInWithGoogle, signInWithPassword, sendEmailCode, verifyEmailCode, error } = useSession();
  const [step, setStep] = useState<Step>(initialStep);
  const [busy, setBusy] = useState<'google' | 'email' | 'password' | null>(null);
  const [workEmail, setWorkEmail] = useState('');
  const [emailProblem, setEmailProblem] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const problem = error ?? authErrorFromUrl();

  const google = async () => {
    setBusy('google');
    await signInWithGoogle();
    // On success the browser leaves for Google; if it did not, let the user try again.
    setBusy(null);
  };

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    const address = workEmail.trim();
    if (!LOOKS_LIKE_EMAIL.test(address)) {
      setEmailProblem('Enter a valid email address.');
      return;
    }
    setBusy('email');
    setEmailProblem(null);
    const result = await sendEmailCode(address);
    setBusy(null);
    if (result.ok) setStep({ name: 'code-sent', email: address.toLowerCase(), sentAt: Date.now() });
    else setEmailProblem(result.message);
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!signInWithPassword) return;
    setBusy('password');
    await signInWithPassword(email.trim(), password);
    setBusy(null);
  };

  const useDifferentEmail = () => {
    clearPendingEmail();
    setStep({ name: 'choose' });
  };

  return (
    <main className="grid min-h-full place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 grid size-10 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
            IS
          </div>
          <h1 className="text-base font-semibold">Sign in to Interior Studio</h1>
          {step.name === 'choose' && <p className="text-sm text-muted-foreground">Continue with Google, or get a sign-in code by email.</p>}
        </CardHeader>
        <CardContent className="grid gap-4">
          {problem && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {problem}
            </p>
          )}

          {step.name === 'code-sent' ? (
            <EmailCodeForm
              email={step.email}
              sentAt={step.sentAt}
              onVerify={(code) => verifyEmailCode(step.email, code)}
              onResend={() => sendEmailCode(step.email)}
              onChangeEmail={useDifferentEmail}
            />
          ) : (
            <>
              <Button onClick={() => void google()} disabled={busy !== null} className="w-full">
                {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
              </Button>

              <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={(e) => void sendCode(e)} noValidate className="grid gap-3">
                {emailProblem && (
                  <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {emailProblem}
                  </p>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="signin-work-email">Work email</Label>
                  <Input
                    id="signin-work-email"
                    type="email"
                    autoComplete="email"
                    value={workEmail}
                    onChange={(e) => setWorkEmail(e.target.value)}
                    placeholder="name@studio.com"
                  />
                </div>
                <Button type="submit" variant="outline" disabled={busy !== null}>
                  {busy === 'email' ? 'Sending…' : 'Email me a sign-in code'}
                </Button>
              </form>

              {signInWithPassword && (
                <form onSubmit={(e) => void submitPassword(e)} className="grid gap-3 border-t pt-4">
                  <p className="text-xs text-muted-foreground">Local test accounts only.</p>
                  <div className="grid gap-1.5">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input id="signin-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" variant="outline" disabled={busy !== null}>
                    {busy === 'password' ? 'Signing in…' : 'Sign in with email'}
                  </Button>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
