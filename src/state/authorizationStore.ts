import { create } from 'zustand';
import type {
  ActorContext,
  ActorRole,
  AuthorizationEvaluationResult,
  ResourceContext,
} from '@/domain/platform/authorization/types';
import { evaluateAuthorization } from '@/domain/platform/authorization/evaluator';
import type { ProjectMember } from '@/domain/platform/authorization/projectMembership';

export interface AuthorizationStoreState {
  actor: ActorContext | null;
  projectMemberships: ProjectMember[];
  isLoading: boolean;
  setActor: (actor: ActorContext | null) => void;
  updateActorRoles: (roles: ActorRole[]) => void;
  setProjectMemberships: (members: ProjectMember[]) => void;
  can: (
    permissionId: string,
    resource?: ResourceContext
  ) => AuthorizationEvaluationResult;
  reset: () => void;
}

export const useAuthorizationStore = create<AuthorizationStoreState>((set, get) => ({
  actor: null,
  projectMemberships: [],
  isLoading: false,

  setActor: (actor) => set({ actor }),

  updateActorRoles: (roles) => {
    const current = get().actor;
    if (!current) return;
    set({
      actor: {
        ...current,
        roles,
      },
    });
  },

  setProjectMemberships: (projectMemberships) => set({ projectMemberships }),

  can: (permissionId, resource) => {
    const { actor, projectMemberships } = get();
    if (!actor) {
      return {
        allowed: false,
        reason: 'No actor authenticated in studio session',
        evaluatedRoles: [],
        missingPermissions: [permissionId],
      };
    }

    // Auto-enrich assignedUserIds from projectMemberships if not provided
    let enrichedResource = resource;
    if (resource && resource.projectId && !resource.assignedUserIds) {
      const assigned = projectMemberships
        .filter((m) => m.projectId === resource.projectId)
        .map((m) => m.userId);
      enrichedResource = {
        ...resource,
        assignedUserIds: assigned,
      };
    }

    return evaluateAuthorization(actor, permissionId, enrichedResource);
  },

  reset: () => {
    set({
      actor: null,
      projectMemberships: [],
      isLoading: false,
    });
  },
}));
