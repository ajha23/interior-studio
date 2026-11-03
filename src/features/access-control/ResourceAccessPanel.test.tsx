import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResourceAccessPanel } from './ResourceAccessPanel';

describe('ResourceAccessPanel (US3, FR-008)', () => {
  it('renders all 4 resource scope options', () => {
    render(
      <ResourceAccessPanel
        scopeType="all_projects"
        specificProjectIds={[]}
        onScopeChange={vi.fn()}
      />
    );

    expect(screen.getByText('All organization projects')).toBeInTheDocument();
    expect(screen.getByText('Team projects only')).toBeInTheDocument();
    expect(screen.getByText('Assigned projects only')).toBeInTheDocument();
    expect(screen.getByText('Specific projects')).toBeInTheDocument();
  });

  it('triggers onScopeChange when clicking a different scope option', () => {
    const onScopeChange = vi.fn();
    render(
      <ResourceAccessPanel
        scopeType="all_projects"
        specificProjectIds={[]}
        onScopeChange={onScopeChange}
      />
    );

    const assignedOption = screen.getByTestId('scope-option-assigned_projects');
    fireEvent.click(assignedOption);

    expect(onScopeChange).toHaveBeenCalledWith('assigned_projects');
  });

  it('displays SpecificProjectPicker when specific_projects is selected', () => {
    const onScopeChange = vi.fn();
    render(
      <ResourceAccessPanel
        scopeType="specific_projects"
        specificProjectIds={['proj_101']}
        onScopeChange={onScopeChange}
      />
    );

    expect(screen.getByTestId('specific-project-picker')).toBeInTheDocument();
    expect(screen.getByTestId('selected-project-tag-proj_101')).toBeInTheDocument();

    // Toggle another project
    const toggleBtn = screen.getByTestId('picker-toggle-proj_102');
    fireEvent.click(toggleBtn);

    expect(onScopeChange).toHaveBeenCalledWith('specific_projects', ['proj_101', 'proj_102']);
  });
});
