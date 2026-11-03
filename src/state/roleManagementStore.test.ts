import { describe, it, expect, beforeEach } from 'vitest';
import { useRoleManagementStore } from './roleManagementStore';
import { bootstrapModuleRegistry } from '@/domain/platform/authorization/bootstrap';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';

describe('useRoleManagementStore (T009, T010)', () => {
  beforeEach(() => {
    moduleRegistry.resetForTesting();
    bootstrapModuleRegistry();
    useRoleManagementStore.getState().initialize('org_test_store', 100);
  });

  it('initializes with default system roles and zero draft', () => {
    const state = useRoleManagementStore.getState();
    expect(state.roles.length).toBeGreaterThanOrEqual(5);
    expect(state.draftRole).toBeNull();
    expect(state.isDirty).toBe(false);
  });

  it('starts creating a role from a predefined template', () => {
    const store = useRoleManagementStore.getState();
    store.startCreateRole('tpl-senior-designer');

    const draft = useRoleManagementStore.getState().draftRole;
    expect(draft).toBeDefined();
    expect(draft?.name).toContain('Senior Designer');
    expect(draft?.permissions.has('designs.3d.export')).toBe(true);
    expect(useRoleManagementStore.getState().isDirty).toBe(false);
  });

  it('tracks dirty state when updating draft fields', () => {
    const store = useRoleManagementStore.getState();
    store.startCreateRole();

    store.updateDraftName('New Draft Role');
    expect(useRoleManagementStore.getState().isDirty).toBe(true);

    store.toggleDraftPermission('designs.2d.view');
    expect(useRoleManagementStore.getState().draftRole?.permissions.has('designs.2d.view')).toBe(true);
  });

  it('clones a system role and adds it to the active roles list', () => {
    const store = useRoleManagementStore.getState();
    const designer = store.roles.find((r) => r.id === 'designer');
    expect(designer).toBeDefined();

    store.openCloneModal(designer!);
    expect(useRoleManagementStore.getState().cloneModalOpen).toBe(true);

    const cloned = store.executeClone('Custom Designer v1', 'Custom clone test');
    expect(cloned.name).toBe('Custom Designer v1');
    expect(cloned.isSystemRole).toBe(false);

    const updatedRoles = useRoleManagementStore.getState().roles;
    expect(updatedRoles.some((r) => r.id === cloned.id)).toBe(true);
  });

  it('triggers change impact modal when saving role with assigned members', () => {
    const store = useRoleManagementStore.getState();
    // 1. Create a custom role
    store.startCreateRole();
    store.updateDraftName('Active Role With Users');
    const created = store.commitSaveDraft();

    // 2. Assign a user to it
    store.assignMember('user_assigned_1', created.id, 'John Doe');

    // 3. Edit role and remove a permission
    store.startEditRole(created.id);
    store.toggleDraftPermission('projects:read'); // toggle

    // 4. Request save -> should open impact modal
    const impact = store.requestSaveDraft();
    expect(impact).not.toBeNull();
    expect(impact?.affectedUserCount).toBe(1);
    expect(useRoleManagementStore.getState().impactModalOpen).toBe(true);

    // 5. Commit save draft
    store.commitSaveDraft();
    expect(useRoleManagementStore.getState().impactModalOpen).toBe(false);
  });

  it('runs effective access simulation reactive to simulator state', () => {
    const store = useRoleManagementStore.getState();
    store.setSimRoleId('owner');
    store.setSimPermissionId('designs.3d.view');

    const result = store.runSimulation('pro');
    expect(result.allowed).toBe(true);
    expect(useRoleManagementStore.getState().simResult).toEqual(result);
  });
});
