import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveStatus } from './SaveStatus';
import { useSyncStore } from './sync';

const base = { projectId: 'p1', readOnly: false, queuedCount: 0, error: null, canRetry: false, conflict: null, head: 3 };

afterEach(() => useSyncStore.setState({ ...base, projectId: null, status: 'saved' }));

describe('SaveStatus (FR-010)', () => {
  it.each([
    ['saved', 'Saved'],
    ['saving', 'Saving…'],
    ['conflict', 'Conflict'],
  ] as const)('reads %s as “%s”', (status, text) => {
    useSyncStore.setState({ ...base, status });
    render(<SaveStatus />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('offline names how many saves wait on this device', () => {
    useSyncStore.setState({ ...base, status: 'offline', queuedCount: 3 });
    render(<SaveStatus />);
    expect(screen.getByRole('status')).toHaveTextContent('Offline (queued 3)');
  });

  it('an error offers Retry only when retrying can help', async () => {
    const retry = vi.fn(async () => undefined);
    useSyncStore.setState({ ...base, status: 'error', canRetry: true, retry, error: { kind: 'server', message: 'The studio could not save. Try again.' } });
    const { unmount } = render(<SaveStatus />);
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't save: The studio could not save. Try again.");
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
    unmount();

    useSyncStore.setState({ ...base, status: 'error', canRetry: false, error: { kind: 'too_large', message: "This design is larger than 2 MB and can't be saved to the studio." } });
    render(<SaveStatus />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('viewers see View only, and no save state', () => {
    useSyncStore.setState({ ...base, status: 'saved', readOnly: true });
    render(<SaveStatus />);
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows nothing for a project on this device', () => {
    useSyncStore.setState({ ...base, projectId: null, status: 'saved' });
    const { container } = render(<SaveStatus />);
    expect(container).toBeEmptyDOMElement();
  });
});
