import { describe, expect, it } from 'vitest';
import {
  addProjectMember,
  getProjectMembers,
  getUserProjects,
  isUserAssignedToProject,
  isUserAssignedToResource,
  type ProjectMember,
  removeProjectMember,
} from './projectMembership';

describe('Project Membership Domain Logic', () => {
  const initialMembers: ProjectMember[] = [
    {
      projectId: 'proj_alpha',
      userId: 'user_alice',
      role: 'lead',
      assignedAt: '2026-11-01T10:00:00Z',
      assignedBy: 'user_admin',
    },
    {
      projectId: 'proj_alpha',
      userId: 'user_bob',
      role: 'contributor',
      assignedAt: '2026-11-01T10:00:00Z',
      assignedBy: 'user_admin',
    },
    {
      projectId: 'proj_beta',
      userId: 'user_charlie',
      role: 'lead',
      assignedAt: '2026-11-01T10:00:00Z',
      assignedBy: 'user_admin',
    },
  ];

  describe('isUserAssignedToProject', () => {
    it('returns true when user is assigned to project', () => {
      expect(isUserAssignedToProject('user_alice', 'proj_alpha', initialMembers)).toBe(true);
      expect(isUserAssignedToProject('user_bob', 'proj_alpha', initialMembers)).toBe(true);
    });

    it('returns false when user is not assigned to project', () => {
      expect(isUserAssignedToProject('user_charlie', 'proj_alpha', initialMembers)).toBe(false);
      expect(isUserAssignedToProject('user_alice', 'proj_beta', initialMembers)).toBe(false);
      expect(isUserAssignedToProject('user_unknown', 'proj_alpha', initialMembers)).toBe(false);
    });
  });

  describe('isUserAssignedToResource', () => {
    it('checks assignedUserIds on resource context', () => {
      expect(
        isUserAssignedToResource('user_alice', {
          projectId: 'proj_alpha',
          assignedUserIds: ['user_alice', 'user_bob'],
        })
      ).toBe(true);

      expect(
        isUserAssignedToResource('user_charlie', {
          projectId: 'proj_alpha',
          assignedUserIds: ['user_alice', 'user_bob'],
        })
      ).toBe(false);

      expect(isUserAssignedToResource('user_alice', {})).toBe(false);
    });
  });

  describe('Membership Helpers', () => {
    it('adds a member and avoids duplicate assignment', () => {
      const newMember: ProjectMember = {
        projectId: 'proj_beta',
        userId: 'user_alice',
        role: 'reviewer',
        assignedAt: '2026-11-02T12:00:00Z',
        assignedBy: 'user_admin',
      };

      const updated = addProjectMember(initialMembers, newMember);
      expect(updated).toHaveLength(4);
      expect(isUserAssignedToProject('user_alice', 'proj_beta', updated)).toBe(true);

      // Adding same user to same project again updates or keeps single entry
      const duplicateMember: ProjectMember = {
        ...newMember,
        role: 'lead',
      };
      const deDuped = addProjectMember(updated, duplicateMember);
      expect(deDuped).toHaveLength(4);
      expect(deDuped.find((m) => m.projectId === 'proj_beta' && m.userId === 'user_alice')?.role).toBe('lead');
    });

    it('removes a member from a project', () => {
      const updated = removeProjectMember(initialMembers, 'proj_alpha', 'user_bob');
      expect(updated).toHaveLength(2);
      expect(isUserAssignedToProject('user_bob', 'proj_alpha', updated)).toBe(false);
      expect(isUserAssignedToProject('user_alice', 'proj_alpha', updated)).toBe(true);
    });

    it('filters project members by project id', () => {
      const alphaMembers = getProjectMembers(initialMembers, 'proj_alpha');
      expect(alphaMembers).toHaveLength(2);
      expect(alphaMembers.map((m) => m.userId)).toEqual(['user_alice', 'user_bob']);
    });

    it('returns all project IDs assigned to a user', () => {
      const aliceProjects = getUserProjects(initialMembers, 'user_alice');
      expect(aliceProjects).toEqual(['proj_alpha']);

      const withBoth = addProjectMember(initialMembers, {
        projectId: 'proj_beta',
        userId: 'user_alice',
        assignedAt: '2026-11-02T12:00:00Z',
        assignedBy: 'user_admin',
      });

      expect(getUserProjects(withBoth, 'user_alice')).toEqual(['proj_alpha', 'proj_beta']);
    });
  });
});
