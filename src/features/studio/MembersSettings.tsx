/**
 * Settings → Members (spec 042, User Story 3, FR-009). Everyone in the studio sees who is in it.
 * Owners and admins also see pending invites, invite by email and change roles. The controls follow
 * the role (FR-010); the database's row-level security and the FR-015 migration enforce the rules.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import type { OrgRole } from '@/features/auth/sessionContext';
import { createMembersApi, type AssignableRole, type Member, type MembersApi, type PendingInvite } from './membersApi';
import type { Studio } from './useStudio';

const ROLE_LABEL: Record<OrgRole, string> = { owner: 'Owner', admin: 'Admin', designer: 'Designer', viewer: 'Viewer' };

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; members: Member[]; invites: PendingInvite[] };

export function MembersSettings({ studio, userId, api: injected }: { studio: Studio; userId: string; api?: MembersApi }) {
  const api = useMemo(() => injected ?? createMembersApi(), [injected]);
  const { orgId, orgName } = studio.membership;
  const { actions } = studio;
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('designer');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listMembers(orgId), actions.seeInvites ? api.listInvites(orgId) : Promise.resolve([])])
      .then(([members, invites]) => !cancelled && setLoad({ state: 'ready', members, invites }))
      .catch((e: unknown) => !cancelled && setLoad({ state: 'error', message: e instanceof Error ? e.message : 'The member list could not be loaded.' }));
    return () => {
      cancelled = true;
    };
  }, [api, orgId, actions.seeInvites, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setNotice(null);
    const result = await api.invite(orgId, email, role, userId);
    setSending(false);
    if (result.ok) {
      setNotice({ tone: 'ok', text: `Invited ${email.trim()} as ${ROLE_LABEL[role].toLowerCase()}. Ask them to sign in with Google using this address.` });
      setEmail('');
      reload();
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  const changeRole = async (member: Member, next: AssignableRole) => {
    setNotice(null);
    const result = await api.changeRole(orgId, member.userId, next);
    setNotice(result.ok ? { tone: 'ok', text: `${member.name} is now ${ROLE_LABEL[next].toLowerCase()}.` } : { tone: 'error', text: result.message });
    reload();
  };

  return (
    <section className="mx-auto grid max-w-3xl gap-6 px-6 py-8">
      <div>
        <h2 className="text-base font-semibold">Members</h2>
        <p className="text-sm text-muted-foreground">
          {actions.invite ? `Invite colleagues to ${orgName} and choose what they can do.` : `People in ${orgName}. Owners and admins manage members.`}
        </p>
      </div>

      {notice &&
        (notice.tone === 'ok' ? (
          <p role="status" className="rounded-md border bg-muted px-3 py-2 text-sm">
            {notice.text}
          </p>
        ) : (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {notice.text}
          </p>
        ))}

      {actions.invite && (
        <form aria-label="Invite a colleague" onSubmit={(e) => void invite(e)} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@studio.com" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as AssignableRole)}>
              {actions.assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" disabled={sending}>
            {sending ? 'Inviting…' : 'Invite'}
          </Button>
        </form>
      )}

      {load.state === 'loading' && <p className="text-sm text-muted-foreground">Loading members…</p>}
      {load.state === 'error' && (
        <div role="alert" className="grid justify-items-start gap-2 text-sm">
          <p>The member list could not be loaded: {load.message}</p>
          <Button variant="outline" size="sm" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {load.state === 'ready' && (
        <>
          <ul className="divide-y rounded-lg border bg-card" aria-label="Members">
            {load.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name} {m.userId === userId && <span className="font-normal text-muted-foreground">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                {actions.changeRoles && m.role !== 'owner' && m.userId !== userId ? (
                  <Select
                    aria-label={`Role for ${m.name}`}
                    className="w-32"
                    value={m.role}
                    onChange={(e) => void changeRole(m, e.target.value as AssignableRole)}
                  >
                    {actions.assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-sm text-muted-foreground">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            ))}
          </ul>

          {actions.seeInvites && (
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold">Pending invites</h3>
              {load.invites.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invites. Invited people join the first time they sign in with Google.</p>
              ) : (
                <ul className="divide-y rounded-lg border bg-card" aria-label="Pending invites">
                  {load.invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="truncate">{i.email}</span>
                      <span className="text-muted-foreground">{ROLE_LABEL[i.role]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
