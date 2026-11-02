import type { ResourceContext } from './types';

export interface ProjectMember {
  projectId: string;
  userId: string;
  role?: string;
  assignedAt: string;
  assignedBy: string;
}

/**
 * Checks if a specific user is assigned to a project within an in-memory or queried membership list.
 */
export function isUserAssignedToProject(
  userId: string,
  projectId: string,
  members: ProjectMember[]
): boolean {
  return members.some((m) => m.projectId === projectId && m.userId === userId);
}

/**
 * Checks if a user is assigned to a project given a ResourceContext.
 */
export function isUserAssignedToResource(
  userId: string,
  resource: ResourceContext
): boolean {
  return !!resource.assignedUserIds?.includes(userId);
}

/**
 * Pure helper to add or update a member in a project membership array.
 */
export function addProjectMember(
  members: ProjectMember[],
  assignment: ProjectMember
): ProjectMember[] {
  const existingIndex = members.findIndex(
    (m) => m.projectId === assignment.projectId && m.userId === assignment.userId
  );

  if (existingIndex >= 0) {
    const updated = [...members];
    updated[existingIndex] = assignment;
    return updated;
  }

  return [...members, assignment];
}

/**
 * Pure helper to remove a member from a project.
 */
export function removeProjectMember(
  members: ProjectMember[],
  projectId: string,
  userId: string
): ProjectMember[] {
  return members.filter(
    (m) => !(m.projectId === projectId && m.userId === userId)
  );
}

/**
 * Pure helper to get all members assigned to a specific project.
 */
export function getProjectMembers(
  members: ProjectMember[],
  projectId: string
): ProjectMember[] {
  return members.filter((m) => m.projectId === projectId);
}

/**
 * Pure helper to get all distinct project IDs assigned to a user.
 */
export function getUserProjects(
  members: ProjectMember[],
  userId: string
): string[] {
  const projectIds = members
    .filter((m) => m.userId === userId)
    .map((m) => m.projectId);
  return Array.from(new Set(projectIds));
}
