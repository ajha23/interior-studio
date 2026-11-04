import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectRosterModal } from './ProjectRosterModal';
import type { ProjectRosterItem } from '@/domain/platform/saas/lifecycleManager';

describe('ProjectRosterModal Component', () => {
  const sampleProjects: ProjectRosterItem[] = [
    { id: 'p1', name: 'Villa Emerald', orgId: 'org1', status: 'active', lastModifiedAt: '2026-11-01' },
    { id: 'p2', name: 'Penthouse Azure', orgId: 'org1', status: 'active', lastModifiedAt: '2026-11-02' },
    { id: 'p3', name: 'Duplex Ruby', orgId: 'org1', status: 'active', lastModifiedAt: '2026-11-03' },
  ];

  it('renders projects and indicates active quota cap', () => {
    render(
      <ProjectRosterModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        projects={sampleProjects}
        allowedActiveCount={2}
      />
    );

    expect(screen.getByTestId('project-roster-modal')).toBeInTheDocument();
    expect(screen.getByText(/Designate Active Projects/i)).toBeInTheDocument();
    expect(screen.getByText('Villa Emerald')).toBeInTheDocument();
    expect(screen.getByText('Penthouse Azure')).toBeInTheDocument();
    expect(screen.getByText('Duplex Ruby')).toBeInTheDocument();
  });

  it('toggles selection and submits selected project IDs', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ProjectRosterModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        projects={sampleProjects}
        allowedActiveCount={2}
        initialSelectedIds={['p1']}
      />
    );

    // Select second project
    const checkbox2 = screen.getByLabelText(/Penthouse Azure/i);
    await user.click(checkbox2);

    const confirmBtn = screen.getByRole('button', { name: /Save Active Roster/i });
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith(['p1', 'p2']);
  });
});
