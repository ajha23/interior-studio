import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudProjectStore } from '@/state/cloudProjectStore';
import { useAuthorizationStore } from '@/state/authorizationStore';
import { CloudProjectModal } from './CloudProjectModal';

describe('CloudProjectModal Component (Feature 034.2.2 FR-03)', () => {
  beforeEach(() => {
    useCloudProjectStore.setState({
      currentOrgId: null,
      activeActorId: null,
      currentProject: null,
      projects: [],
      spaces: [],
      activeSpaceId: null,
      revisions: {},
      syncState: {
        localProjectId: 'doc-1',
        syncStatus: 'draft',
        baseRevisionId: null,
      },
      isSyncing: false,
    });
    useAuthorizationStore.setState({
      actor: null,
    });
  });

  it('renders unauthenticated session banner when active actor or org is missing', () => {
    render(<CloudProjectModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByTestId('cloud-project-modal')).toBeInTheDocument();
    expect(screen.getByTestId('unauthenticated-session-banner')).toBeInTheDocument();
    expect(screen.getByText(/Active Session & Organization Required/i)).toBeInTheDocument();
  });

  it('connects development session in DEV environment when dev button clicked', async () => {
    const user = userEvent.setup();
    render(<CloudProjectModal isOpen={true} onClose={vi.fn()} />);

    const devBtn = screen.queryByTestId('dev-connect-session-btn');
    if (import.meta.env.DEV) {
      expect(devBtn).toBeInTheDocument();
      await user.click(devBtn!);

      expect(useCloudProjectStore.getState().activeActorId).toBe('00000000-0000-4000-8000-000000000002');
      expect(useCloudProjectStore.getState().currentOrgId).toBe('00000000-0000-4000-8000-000000000001');
      expect(screen.queryByTestId('unauthenticated-session-banner')).not.toBeInTheDocument();
    }
  });

  it('does not show unauthenticated banner when user is authenticated with active org', () => {
    useCloudProjectStore.setState({
      currentOrgId: '00000000-0000-4000-8000-000000000001',
      activeActorId: 'usr-auth-123',
    });
    useAuthorizationStore.setState({
      actor: {
        id: 'usr-auth-123',
        orgId: '00000000-0000-4000-8000-000000000001',
        roles: [],
      },
    });

    render(<CloudProjectModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.queryByTestId('unauthenticated-session-banner')).not.toBeInTheDocument();
  });
});
