import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoleEditorView } from './RoleEditorView';
import { useRoleManagementStore } from '@/state/roleManagementStore';
import { bootstrapModuleRegistry } from '@/domain/platform/authorization/bootstrap';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';

describe('RoleEditorView (US2, US3, US6, FR-005, FR-011)', () => {
  beforeEach(() => {
    moduleRegistry.resetForTesting();
    bootstrapModuleRegistry();
    const store = useRoleManagementStore.getState();
    store.initialize('org_test_editor_view', 100);

    // Create a custom role to edit
    store.startCreateRole();
    store.updateDraftName('Lead Kitchen Architect');
    store.updateDraftDescription('Responsible for high-end modular kitchens');
    const role = store.commitSaveDraft();

    // Assign a user
    store.assignMember('user_vikram_01', role.id, 'Vikram Burman');

    // Start editing it
    store.startEditRole(role.id);
  });

  it('renders editor with breadcrumbs, role title, and 5 tabs', () => {
    render(<RoleEditorView onBack={vi.fn()} />);

    expect(screen.getByTestId('editor-role-name')).toHaveTextContent('Lead Kitchen Architect');
    expect(screen.getByTestId('tab-permissions')).toBeInTheDocument();
    expect(screen.getByTestId('tab-scope')).toBeInTheDocument();
    expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('tab-members')).toBeInTheDocument();
    expect(screen.getByTestId('tab-history')).toBeInTheDocument();
  });

  it('navigates between tabs seamlessly', () => {
    render(<RoleEditorView onBack={vi.fn()} />);

    // Click Resource Access tab
    fireEvent.click(screen.getByTestId('tab-scope'));
    expect(screen.getByTestId('resource-access-panel')).toBeInTheDocument();

    // Click Overview tab
    fireEvent.click(screen.getByTestId('tab-overview'));
    expect(screen.getByTestId('editor-name-input')).toBeInTheDocument();

    // Click Members tab
    fireEvent.click(screen.getByTestId('tab-members'));
    expect(screen.getByTestId('role-members-tab')).toBeInTheDocument();
    expect(screen.getByText('Vikram Burman')).toBeInTheDocument();
  });

  it('detects unsaved changes and prompts discard warning on exit', () => {
    const onBack = vi.fn();
    render(<RoleEditorView onBack={onBack} />);

    // Make an edit in Overview tab
    fireEvent.click(screen.getByTestId('tab-overview'));
    const nameInput = screen.getByTestId('editor-name-input');
    fireEvent.change(nameInput, { target: { value: 'Modified Role Name' } });

    // Expect unsaved changes badge in summary sidebar
    expect(screen.getByTestId('unsaved-changes-badge')).toBeInTheDocument();

    // Click Back
    const backBtn = screen.getByText('Roles & Permissions');
    fireEvent.click(backBtn);

    // Warning modal should appear
    expect(screen.getByText('Discard Unsaved Changes?')).toBeInTheDocument();

    // Confirm discard
    const confirmDiscardBtn = screen.getByTestId('confirm-discard-btn');
    fireEvent.click(confirmDiscardBtn);

    expect(onBack).toHaveBeenCalled();
  });

  it('enforces Last-Owner safeguard when attempting to remove sole owner in members tab', () => {
    const store = useRoleManagementStore.getState();
    // Assign sole owner
    store.assignMember('user_sole_owner', 'owner', 'Sole Owner');
    store.startEditRole('owner');

    render(<RoleEditorView onBack={vi.fn()} />);

    // Switch to members tab
    fireEvent.click(screen.getByTestId('tab-members'));

    // Attempt to unassign the sole owner
    const unassignBtn = screen.getByTestId('unassign-btn-user_sole_owner');
    fireEvent.click(unassignBtn);

    // Error banner should be displayed
    expect(screen.getByTestId('members-error-banner')).toHaveTextContent('CANNOT_REMOVE_LAST_OWNER');
  });
});
