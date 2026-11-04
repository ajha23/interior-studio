import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoleManagementPanel } from './RoleManagementPanel';
import { AdminRoleService } from '@/domain/platform/authorization/adminRoleService';

describe('RoleManagementPanel Component (US2)', () => {
  let adminService: AdminRoleService;

  beforeEach(() => {
    adminService = new AdminRoleService();
  });

  it('renders system role templates and shows lock notice for immutable roles', () => {
    render(
      <RoleManagementPanel
        adminService={adminService}
        orgId="org_test"
        actorRank={100}
      />
    );

    expect(screen.getByText('Studio Roles')).toBeInTheDocument();
    expect(screen.getAllByText('Owner').length).toBeGreaterThan(0);
    expect(screen.getByText('Designer')).toBeInTheDocument();
    expect(screen.getByText(/Default system roles are immutable templates/i)).toBeInTheDocument();
  });

  it('opens new custom role form and creates a custom role', () => {
    render(
      <RoleManagementPanel
        adminService={adminService}
        orgId="org_test"
        actorRank={100}
      />
    );

    const newBtn = screen.getByTestId('create-role-btn');
    fireEvent.click(newBtn);

    expect(screen.getByText('Create Custom Studio Role')).toBeInTheDocument();

    const nameInput = screen.getByTestId('new-role-name');
    fireEvent.change(nameInput, { target: { value: 'Junior Drafter' } });

    const saveBtn = screen.getByTestId('save-new-role-btn');
    fireEvent.click(saveBtn);

    expect(screen.getAllByText(/Junior Drafter/i).length).toBeGreaterThan(0);
  });

  it('clones an existing role template into a customized role', () => {
    render(
      <RoleManagementPanel
        adminService={adminService}
        orgId="org_test"
        actorRank={100}
      />
    );

    const cloneBtn = screen.getByTestId('clone-role-btn');
    fireEvent.click(cloneBtn);

    expect(screen.getByText(/Role cloned into/i)).toBeInTheDocument();
  });
});
