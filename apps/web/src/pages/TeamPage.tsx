import { useState } from 'react';
import { canAdmin, useAuth } from '../auth/AuthProvider';
import { useInvite, useInvites, useMembers, useRevokeInvite, useUpdateMember } from '../data/team';
import type { OrgRoleT } from '../lib/database.types';
import { errorMessage } from '../lib/supabase';
import { relativeTime } from '../ui/format';

type AssignableRole = Exclude<OrgRoleT, 'owner'>;
const ROLES: { value: AssignableRole; label: string; hint: string }[] = [
  { value: 'designer', label: 'Designer', hint: 'Creates and edits projects' },
  { value: 'admin', label: 'Admin', hint: 'Designer + manages team, archives projects' },
  { value: 'viewer', label: 'Viewer', hint: 'Read-only' },
];

export function TeamPage() {
  const { activeOrg, session } = useAuth();
  const admin = canAdmin(activeOrg?.role);
  const members = useMembers();
  const invites = useInvites(admin);
  const invite = useInvite();
  const revoke = useRevokeInvite();
  const updateMember = useUpdateMember();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('designer');

  const pending = invites.data?.filter((i) => !i.acceptedAt) ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <h1>Team</h1>
      </header>

      {admin && (
        <section className="panel" aria-labelledby="invite-h">
          <h2 id="invite-h" className="section-h">Invite a designer</h2>
          <p className="muted small">They sign in with Google using this exact email; access starts at their first sign-in.</p>
          <form
            className="row gap wrap"
            onSubmit={async (e) => {
              e.preventDefault();
              await invite.mutateAsync({ email, role });
              setEmail('');
            }}
          >
            <input type="email" required placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email to invite" className="grow" />
            <select value={role} onChange={(e) => setRole(e.target.value as AssignableRole)} aria-label="Role">
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button className="btn btn-primary" disabled={invite.isPending}>{invite.isPending ? 'Inviting…' : 'Send invite'}</button>
          </form>
          {invite.error && <p className="form-error" role="alert">{errorMessage(invite.error)}</p>}
          <ul className="hint-list">
            {ROLES.map((r) => <li key={r.value}><strong>{r.label}</strong> — {r.hint}</li>)}
          </ul>
        </section>
      )}

      <section aria-labelledby="members-h">
        <h2 id="members-h" className="section-h">Members ({members.data?.length ?? 0})</h2>
        {members.error && <p className="form-error">{errorMessage(members.error)}</p>}
        {updateMember.error && <p className="form-error">{errorMessage(updateMember.error)}</p>}
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th>{admin && <th aria-label="Actions" />}</tr>
          </thead>
          <tbody>
            {members.data?.map((m) => {
              const self = m.userId === session?.user.id;
              const locked = m.role === 'owner' || self || !admin;
              return (
                <tr key={m.userId}>
                  <td>{m.name ?? '—'}{self && <span className="muted"> (you)</span>}</td>
                  <td>{m.email}</td>
                  <td>
                    {locked ? (
                      <span className="cap">{m.role}</span>
                    ) : (
                      <select
                        value={m.role}
                        aria-label={`Role of ${m.email}`}
                        onChange={(e) => updateMember.mutate({ userId: m.userId, role: e.target.value as AssignableRole })}
                      >
                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="muted">{relativeTime(m.joinedAt)}</td>
                  {admin && (
                    <td className="right">
                      {!locked && (
                        <button
                          className="btn btn-ghost btn-sm danger"
                          onClick={() => {
                            if (confirm(`Remove ${m.email} from ${activeOrg?.orgName}?`)) updateMember.mutate({ userId: m.userId, remove: true });
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {admin && pending.length > 0 && (
        <section aria-labelledby="pending-h">
          <h2 id="pending-h" className="section-h">Pending invites ({pending.length})</h2>
          <table className="table">
            <thead><tr><th>Email</th><th>Role</th><th>Invited</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {pending.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td className="cap">{i.role}</td>
                  <td className="muted">{relativeTime(i.createdAt)}</td>
                  <td className="right">
                    <button className="btn btn-ghost btn-sm" onClick={() => revoke.mutate(i.id)}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
