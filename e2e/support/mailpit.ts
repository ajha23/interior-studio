/**
 * Test-only helper for the LOCAL Supabase stack (spec 054, research R8): reads sign-in emails from
 * Mailpit, the local mail catcher. It refuses any URL that is not on this machine.
 */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export interface SignInEmail {
  subject: string;
  text: string;
  html: string;
  /** The 6-digit code. */
  code: string;
  /** The "Sign in to Interior Studio" link (contains `token_hash=`). */
  link: string;
}

function local(): string {
  const host = new URL(MAILPIT_URL).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') throw new Error(`Refusing to read mail from a non-local server: ${MAILPIT_URL}`);
  return MAILPIT_URL;
}

interface MailpitSummary {
  ID: string;
  Created: string;
}

async function search(address: string): Promise<MailpitSummary[]> {
  const res = await fetch(`${local()}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
  const body = (await res.json()) as { messages?: MailpitSummary[] };
  return body.messages ?? [];
}

/** How many emails Mailpit holds for the address. */
export async function emailCount(address: string): Promise<number> {
  return (await search(address)).length;
}

/** The newest email for the address (optionally only one received after `after`), waiting up to `timeoutMs`. */
export async function latestEmail(address: string, { after, timeoutMs = 10_000 }: { after?: Date; timeoutMs?: number } = {}): Promise<SignInEmail> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const newest = (await search(address)).find((m) => !after || new Date(m.Created) > after);
    if (newest) {
      const res = await fetch(`${local()}/api/v1/message/${newest.ID}`);
      if (!res.ok) throw new Error(`Mailpit message failed: ${res.status}`);
      const m = (await res.json()) as { Subject: string; Text: string; HTML: string };
      const code = /\b(\d{6})\b/.exec(m.Subject)?.[1] ?? /\b(\d{6})\b/.exec(m.Text)?.[1];
      const link = /href="([^"]*token_hash=[^"]*)"/.exec(m.HTML)?.[1]?.replace(/&amp;/g, '&');
      if (!code || !link) throw new Error(`Email for ${address} has no code or link: ${m.Subject}`);
      return { subject: m.Subject, text: m.Text, html: m.HTML, code, link };
    }
    if (Date.now() > deadline) throw new Error(`No email for ${address} within ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, 250));
  }
}
