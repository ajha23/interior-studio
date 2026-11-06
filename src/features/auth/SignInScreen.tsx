/**
 * The only screen a signed-out visitor sees (spec 042, User Story 1). Production offers Google only;
 * the email form appears in local and test builds where password sign-in is enabled.
 */
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authErrorFromUrl } from './returnTo';
import { useSession } from './useSession';

export function SignInScreen() {
  const { signInWithGoogle, signInWithPassword, error } = useSession();
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const problem = error ?? authErrorFromUrl();

  const google = async () => {
    setBusy('google');
    await signInWithGoogle();
    // On success the browser leaves for Google; if it did not, let the user try again.
    setBusy(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!signInWithPassword) return;
    setBusy('email');
    await signInWithPassword(email.trim(), password);
    setBusy(null);
  };

  return (
    <main className="grid min-h-full place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 grid size-10 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
            IS
          </div>
          <h1 className="text-base font-semibold">Sign in to Interior Studio</h1>
          <p className="text-sm text-muted-foreground">Use the Google account your studio invited.</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          {problem && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {problem}
            </p>
          )}
          <Button onClick={() => void google()} disabled={busy !== null} className="w-full">
            {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
          </Button>

          {signInWithPassword && (
            <form onSubmit={(e) => void submit(e)} className="grid gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">Local test accounts only.</p>
              <div className="grid gap-1.5">
                <Label htmlFor="signin-email">Email</Label>
                <Input id="signin-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="signin-password">Password</Label>
                <Input id="signin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" variant="outline" disabled={busy !== null}>
                {busy === 'email' ? 'Signing in…' : 'Sign in with email'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
