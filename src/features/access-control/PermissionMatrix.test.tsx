import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionMatrix } from './PermissionMatrix';
import { bootstrapModuleRegistry } from '@/domain/platform/authorization/bootstrap';
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';

describe('PermissionMatrix (US2, FR-006, FR-007)', () => {
  beforeEach(() => {
    moduleRegistry.resetForTesting();
    bootstrapModuleRegistry();
  });

  it('renders module accordions and permission capability rows', () => {
    const granted = new Set<string>(['projects:read', 'projects:write']);
    render(
      <PermissionMatrix
        grantedPermissions={granted}
        onTogglePermission={vi.fn()}
        onSetModulePermissions={vi.fn()}
      />
    );

    expect(screen.getByText('Projects & Workspaces')).toBeInTheDocument();
    expect(screen.getByText('Floor Plans & 2D Drafting')).toBeInTheDocument();
    expect(screen.getByText('View Projects')).toBeInTheDocument();
  });

  it('handles Select All and Clear All module actions', () => {
    const onSetModulePermissions = vi.fn();
    render(
      <PermissionMatrix
        grantedPermissions={new Set()}
        onTogglePermission={vi.fn()}
        onSetModulePermissions={onSetModulePermissions}
      />
    );

    const selectAllBtn = screen.getByTestId('select-all-module-projects');
    fireEvent.click(selectAllBtn);
    expect(onSetModulePermissions).toHaveBeenCalledWith('module-projects', true);

    const clearAllBtn = screen.getByTestId('clear-all-module-projects');
    fireEvent.click(clearAllBtn);
    expect(onSetModulePermissions).toHaveBeenCalledWith('module-projects', false);
  });

  it('toggles permission when individual capability checkbox is clicked', () => {
    const onTogglePermission = vi.fn();
    render(
      <PermissionMatrix
        grantedPermissions={new Set()}
        onTogglePermission={onTogglePermission}
        onSetModulePermissions={vi.fn()}
      />
    );

    const checkbox = screen.getByTestId('perm-checkbox-projects:read');
    fireEvent.click(checkbox);
    expect(onTogglePermission).toHaveBeenCalledWith('projects:read');
  });

  it('filters capabilities dynamically when searching in matrix input', () => {
    render(
      <PermissionMatrix
        grantedPermissions={new Set()}
        onTogglePermission={vi.fn()}
        onSetModulePermissions={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId('matrix-search-input');
    fireEvent.change(searchInput, { target: { value: 'cutlist' } });

    expect(screen.getByText('Download Cut Lists')).toBeInTheDocument();
    expect(screen.queryByText('Floor Plan Drafting')).not.toBeInTheDocument();
  });
});
