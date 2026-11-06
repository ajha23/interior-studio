/**
 * The page the emailed link opens (spec 054, User Story 2, FR-004): `/auth/confirm?token_hash=…`.
 * Opening it does nothing; only its one "Sign in" button uses the link, so mail scanners that open
 * links cannot use it up, and it works on any device (research R1–R3). The token is handed to the
 * official client unchanged; Supabase Auth decides whether it is valid.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useSession } from './useSession';

/** The emailed link's token from a query string (`location.search`), on any path; null if absent. */
export function readEmailLinkToken(search: string): string | null {
  return new URLSearchParams(search).get('token_hash') || null;
}

/** Drops the token from the address bar and leaves the app on `/` with its route hash. */
function leaveLinkPage() {
  const hash = window.location.hash && window.location.hash !== '#' ? window.location.hash : '#/';
  window.history.replaceState(window.history.state, '', `/${hash}`);
}

type State = 'ready' | 'verifying' | 'expired';

export function EmailLinkConfirm({ tokenHash, onDone }: { tokenHash: string | null; onDone: () => void }) {
  const { status, confirmEmailLink } = useSession();
  const [state, setState] = useState<State>(tokenHash ? 'ready' : 'expired');
  const [message, setMessage] = useState('This sign-in link has expired.');
  const button = useRef<HTMLButtonElement>(null);

  // Signed in, by this click or already before: the link is no longer needed.
  useEffect(() => {
    if (status !== 'signed-in') return;
    leaveLinkPage();
    onDone();
  }, [status, onDone]);

  useEffect(() => {
    if (state === 'ready') button.current?.focus();
  }, [state]);

  const signIn = async () => {
    if (!tokenHash) return;
    setState('verifying');
    const result = await confirmEmailLink(tokenHash);
    if (!result.ok) {
      setMessage(result.message);
      setState('expired');
    }
  };

  return (
    <main className="grid min-h-full place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 grid size-10 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
            IS
          </div>
          <h1 className="text-base font-semibold">Sign in to Interior Studio</h1>
        </CardHeader>
        <CardContent className="grid gap-4">
          {state === 'expired' ? (
            <>
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {message}
              </p>
              <p className="text-sm text-muted-foreground">Ask for a new email, or enter the 6-digit code from the newest one.</p>
              <a href="/" className="text-center text-sm font-medium underline underline-offset-4">
                Back to sign-in
              </a>
            </>
          ) : (
            <>
              <p className="text-center text-sm text-muted-foreground">Click to finish signing in on this device.</p>
              <Button ref={button} onClick={() => void signIn()} disabled={state === 'verifying' || status === 'loading'} className="w-full">
                {state === 'verifying' ? 'Signing in…' : 'Sign in'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Shows the link page instead of the app while the address carries an emailed link's token
 * (spec 054, FR-004); afterwards, and for every other address, renders the app unchanged.
 */
export function EmailLinkGate({ children }: { children: ReactNode }) {
  // Read once: the address bar is cleaned after sign-in. `token_hash=` with no value is an expired link.
  const [link] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('token_hash') ? { tokenHash: readEmailLinkToken(window.location.search) } : null;
  });
  const [done, setDone] = useState(false);
  const finish = useCallback(() => setDone(true), []);
  if (!link || done) return <>{children}</>;
  return <EmailLinkConfirm tokenHash={link.tokenHash} onDone={finish} />;
}
