import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Membership } from '@/features/auth/sessionContext';
import { actionsFor } from './roleActions';
import { StudioDetails } from './StudioDetails';

function studio(role: Membership['role'], plan = 'free') {
  const membership: Membership = { orgId: 'org-s', orgName: "Solo's studio", orgSlug: 'solo-s-studio-ab12cd', role, plan };
  return { membership, actions: actionsFor(role) };
}

describe('StudioDetails', () => {
  it('owners and admins rename the studio; the new name is saved and memberships refresh', async () => {
    const rename = vi.fn(async () => ({ ok: true as const }));
    const refresh = vi.fn(async () => {});
    render(<StudioDetails studio={studio('owner')} rename={rename} onRenamed={refresh} />);
    const field = screen.getByLabelText('Studio name');
    fireEvent.change(field, { target: { value: '  Sharma Interiors  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(rename).toHaveBeenCalledWith('org-s', 'Sharma Interiors'));
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Studio renamed');
  });

  it('rejects names outside 2–120 characters without calling the database', () => {
    const rename = vi.fn(async () => ({ ok: true as const }));
    render(<StudioDetails studio={studio('admin')} rename={rename} onRenamed={vi.fn(async () => {})} />);
    fireEvent.change(screen.getByLabelText('Studio name'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(screen.getByRole('alert')).toHaveTextContent('2 to 120 characters');
    expect(rename).not.toHaveBeenCalled();
  });

  it('designers and viewers see the name and plan read-only', () => {
    for (const role of ['designer', 'viewer'] as const) {
      const { unmount } = render(<StudioDetails studio={studio(role)} rename={vi.fn()} onRenamed={vi.fn()} />);
      expect(screen.getByText("Solo's studio")).toBeInTheDocument();
      expect(screen.queryByLabelText('Studio name')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('shows the plan', () => {
    render(<StudioDetails studio={studio('owner', 'free')} rename={vi.fn()} onRenamed={vi.fn()} />);
    expect(screen.getByText('Free plan')).toBeInTheDocument();
  });
});
