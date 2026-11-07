import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Result, VersionRow } from '@/infrastructure/projects/cloudProjects';
import type { AppSupabaseClient } from '@/infrastructure/supabase/client';

const info = vi.fn<() => Promise<Result<VersionRow>>>();
vi.mock('@/infrastructure/projects/cloudProjects', async (importOriginal) => ({ ...(await importOriginal<object>()), versionInfo: () => info() }));
const { ConflictDialog, DISCARD_PROMPT } = await import('./ConflictDialog');
const { useSyncStore } = await import('./sync');
const { useStudioContext } = await import('./studioContext');

const saveMineOnTop = vi.fn(async () => true);
const loadTheirs = vi.fn(async () => true);

beforeEach(() => {
  info.mockResolvedValue({ ok: true, value: { versionNo: 4, kind: 'autosave', message: '', docType: 'kitchen', sizeBytes: 100, createdAt: '2026-11-07T10:00:00Z', authorName: 'Alpha Admin' } });
  useStudioContext.setState({ studio: { client: {} as AppSupabaseClient, userId: 'u1', orgId: 'org-a', slug: 'alpha', name: 'Alpha Studio', role: 'designer' } });
  useSyncStore.setState({ status: 'conflict', conflict: { currentVersionNo: 4 }, conflictOpen: true, projectId: 'p1', saveMineOnTop, loadTheirs });
  saveMineOnTop.mockClear();
  loadTheirs.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  useSyncStore.setState({ status: 'saved', conflict: null, conflictOpen: false, projectId: null });
});

describe('the conflict dialog (US3, FR-012)', () => {
  it('names who saved the newer version and when', async () => {
    render(<ConflictDialog />);
    expect(screen.getByRole('dialog', { name: 'Someone else saved this project' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('conflict-who')).toHaveTextContent('Alpha Admin saved version 4 at'));
  });

  it('Save mine on top asks nothing and resolves through the controller', async () => {
    render(<ConflictDialog />);
    await userEvent.click(screen.getByRole('button', { name: 'Save mine on top' }));
    expect(saveMineOnTop).toHaveBeenCalled();
  });

  it('Load theirs discards my changes only after I confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ConflictDialog />);
    await userEvent.click(screen.getByRole('button', { name: 'Load theirs' }));
    expect(confirm).toHaveBeenCalledWith(DISCARD_PROMPT);
    expect(loadTheirs).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Load theirs' }));
    expect(loadTheirs).toHaveBeenCalled();
  });

  it('closing keeps the conflict, and the status reopens the dialog', async () => {
    const { SaveStatus } = await import('./SaveStatus');
    render(
      <>
        <SaveStatus />
        <ConflictDialog />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Decide later' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useSyncStore.getState().status).toBe('conflict');
    await userEvent.click(screen.getByRole('button', { name: /Conflict/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a failed resolution says why and stays open', async () => {
    saveMineOnTop.mockResolvedValueOnce(false);
    useSyncStore.setState({ error: { kind: 'offline', message: "You're offline — this needs a connection." } });
    render(<ConflictDialog />);
    await userEvent.click(screen.getByRole('button', { name: 'Save mine on top' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You're offline — this needs a connection.");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
