import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RolesDashboard } from './RolesDashboard';
import { useRoleManagementStore } from '@/state/roleManagementStore';
import { bootstrapModuleRegistry } from '@/domain/platform/authorization/bootstrap';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';

describe('RolesDashboard (US1, FR-001, FR-002, FR-003)', () => {
  beforeEach(() => {
    moduleRegistry.resetForTesting();
    bootstrapModuleRegistry();
    const store = useRoleManagementStore.getState();
    store.initialize('org_test_dashboard', 100);
    useRoleManagementStore.setState({
      searchQuery: '',
      typeFilter: 'all',
      scopeFilter: 'all',
      cloneModalOpen: false,
      cloneSourceRole: null,
      draftRole: null,
      isDirty: false,
    });
  });

  it('renders the header and all 4 metric cards', () => {
    render(<RolesDashboard />);

    expect(screen.getByText('Roles & Permissions')).toBeInTheDocument();
    expect(screen.getByTestId('metric-total-roles')).toBeInTheDocument();
    expect(screen.getByTestId('metric-custom-roles')).toBeInTheDocument();
    expect(screen.getByTestId('metric-assigned-users')).toBeInTheDocument();
    expect(screen.getByTestId('metric-plan-restricted')).toBeInTheDocument();
  });

  it('renders default system roles in the data table', () => {
    render(<RolesDashboard />);

    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Designer')).toBeInTheDocument();
  });

  it('filters roles dynamically when typing in search input', () => {
    render(<RolesDashboard />);

    const searchInput = screen.getByTestId('role-search-input');
    fireEvent.change(searchInput, { target: { value: 'Designer' } });

    expect(screen.getByText('Designer')).toBeInTheDocument();
    expect(screen.queryByText('Owner')).not.toBeInTheDocument();
  });

  it('filters by role type (system vs custom)', () => {
    // Create one custom role first
    const store = useRoleManagementStore.getState();
    store.startCreateRole();
    store.updateDraftName('Unique Custom Specialist');
    store.commitSaveDraft();

    render(<RolesDashboard />);

    const typeFilter = screen.getByTestId('role-type-filter');

    // Filter to custom only
    fireEvent.change(typeFilter, { target: { value: 'custom' } });
    expect(screen.getByText('Unique Custom Specialist')).toBeInTheDocument();
    expect(screen.queryByText('Owner')).not.toBeInTheDocument();

    // Filter to system only
    fireEvent.change(typeFilter, { target: { value: 'system' } });
    expect(screen.queryByText('Unique Custom Specialist')).not.toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('opens clone modal when clicking clone on a system role and navigates on success', () => {
    const onNavigateToEditor = vi.fn();
    render(<RolesDashboard onNavigateToEditor={onNavigateToEditor} />);

    // Click clone role on designer
    const cloneBtn = screen.getByTestId('clone-role-designer');
    fireEvent.click(cloneBtn);

    expect(screen.getByTestId('clone-role-modal')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Designer (Copy)')).toBeInTheDocument();

    const submitBtn = screen.getByTestId('clone-role-submit-btn');
    fireEvent.click(submitBtn);

    expect(onNavigateToEditor).toHaveBeenCalled();
  });

  it('triggers navigation when clicking create role button', () => {
    const onNavigateToWizard = vi.fn();
    render(<RolesDashboard onNavigateToWizard={onNavigateToWizard} />);

    const createBtn = screen.getByTestId('create-role-btn');
    fireEvent.click(createBtn);

    expect(onNavigateToWizard).toHaveBeenCalled();
  });
});
