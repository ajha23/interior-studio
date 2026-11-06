import { describe, expect, it } from 'vitest';
import { actionsFor, chooseStudio } from './roleActions';
import type { Membership } from '@/features/auth/sessionContext';

describe('actionsFor (data-model.md: role → visible actions)', () => {
  it('owners and admins see invites and can invite and change roles', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(actionsFor(role)).toEqual({ seeMembers: true, seeInvites: true, invite: true, changeRoles: true, assignableRoles: ['admin', 'designer', 'viewer'] });
    }
  });

  it('designers and viewers only see members', () => {
    for (const role of ['designer', 'viewer'] as const) {
      expect(actionsFor(role)).toEqual({ seeMembers: true, seeInvites: false, invite: false, changeRoles: false, assignableRoles: [] });
    }
  });

  it('never offers owner as a choice', () => {
    for (const role of ['owner', 'admin', 'designer', 'viewer'] as const) expect(actionsFor(role).assignableRoles).not.toContain('owner');
  });
});

const m = (slug: string): Membership => ({ orgId: `id-${slug}`, orgName: slug, orgSlug: slug, role: 'designer', plan: 'free' });

describe('chooseStudio (where #/ goes)', () => {
  it('a single studio is chosen directly', () => {
    expect(chooseStudio([m('alpha')], null)).toBe('alpha');
    expect(chooseStudio([m('alpha')], 'beta')).toBe('alpha');
  });

  it('with several, the last-used studio is chosen if still a membership', () => {
    expect(chooseStudio([m('alpha'), m('beta')], 'beta')).toBe('beta');
  });

  it('with several and no usable last studio, nothing is chosen (show the picker)', () => {
    expect(chooseStudio([m('alpha'), m('beta')], null)).toBeNull();
    expect(chooseStudio([m('alpha'), m('beta')], 'gamma')).toBeNull();
  });

  it('with none, nothing is chosen', () => {
    expect(chooseStudio([], 'alpha')).toBeNull();
  });
});
