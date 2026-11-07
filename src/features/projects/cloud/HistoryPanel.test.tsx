import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import type { OpenedDoc, Result, VersionRow } from '@/infrastructure/projects/cloudProjects';
import type { AppSupabaseClient } from '@/infrastructure/supabase/client';

const list = vi.fn<(page: number) => Promise<Result<VersionRow[]>>>();
const openVersion = vi.fn<(versionNo: number) => Promise<Result<OpenedDoc>>>();
const openHead = vi.fn<() => Promise<Result<OpenedDoc>>>();
vi.mock('@/infrastructure/projects/cloudProjects', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  HISTORY_PAGE: 2,
  listVersions: (_c: unknown, _p: string, page: number) => list(page),
  openVersion: (_c: unknown, _p: string, v: number) => openVersion(v),
  openHead: () => openHead(),
}));
const { HistoryPanel, VersionBanner } = await import('./HistoryPanel');
const { useHistoryStore } = await import('./history');
const { useSyncStore } = await import('./sync');
const { useStudioContext } = await import('./studioContext');
const { useEditorStore } = await import('@/state/editorStore');

const ID = 'p1';
const v = (versionNo: number, kind: string, message = ''): VersionRow => ({ versionNo, kind, message, docType: 'kitchen', sizeBytes: 100, createdAt: '2026-11-07T10:00:00Z', authorName: 'Alpha Designer' });
const doc = (width: number) => ({ type: 'kitchen' as const, project: { ...createProject({ name: 'Rao kitchen', room: { ...DEFAULT_ROOM, width }, layout: 'empty' }), id: ID } });
const saveVersion = vi.fn(async () => true);

function enter(role: 'designer' | 'viewer') {
  useStudioContext.setState({ studio: { client: {} as AppSupabaseClient, userId: 'u1', orgId: 'org-a', slug: 'alpha', name: 'Alpha Studio', role } });
}

beforeEach(() => {
  enter('designer');
  useSyncStore.setState({ projectId: ID, head: 4, readOnly: false, saveVersion });
  useHistoryStore.setState({ open: true, viewing: null, error: null });
  list.mockImplementation(async (page) => ({ ok: true, value: page === 0 ? [v(4, 'autosave'), v(3, 'manual', 'client review')] : [v(2, 'restore'), v(1, 'manual')] }));
  openVersion.mockResolvedValue({ ok: true, value: { versionNo: 3, doc: doc(3000) } });
  openHead.mockResolvedValue({ ok: true, value: { versionNo: 4, doc: doc(4000) } });
  useEditorStore.getState().openProject(doc(4000).project);
  saveVersion.mockClear();
});
afterEach(() => useSyncStore.setState({ projectId: null }));

describe('version history (US5)', () => {
  it('lists versions newest first with kind, author, time and message, a page at a time', async () => {
    render(<HistoryPanel />);
    const rows = await screen.findAllByTestId('version-row');
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringMatching(/^Version 4Latest.*Autosave · Alpha Designer/), expect.stringMatching(/^Version 3.*Saved version · Alpha Designer.*“client review”/)]);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(screen.getAllByTestId('version-row')).toHaveLength(4));
    expect(screen.getAllByTestId('version-row')[2]).toHaveTextContent('Restore');
  });

  it('opening a past version shows it read-only with a banner naming it', async () => {
    render(
      <>
        <VersionBanner />
        <HistoryPanel />
      </>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Open version 3' }));
    await waitFor(() => expect(screen.getByTestId('version-banner')).toHaveTextContent('Viewing version 3 (Saved version · Alpha Designer'));
    expect(useEditorStore.getState().project!.room.width).toBe(3000);
    expect(useEditorStore.getState().readOnly).toBe(true);
    expect(useHistoryStore.getState().open).toBe(false);
  });

  it('Restore saves that version as a new restore version on top; nothing is deleted', async () => {
    render(<VersionBanner />);
    await useHistoryStore.getState().view(v(3, 'manual'));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(saveVersion).toHaveBeenCalledWith('Restored version 3', 'restore');
    expect(useEditorStore.getState().readOnly).toBe(false);
    expect(useEditorStore.getState().project!.room.width).toBe(3000);
    await waitFor(() => expect(screen.queryByTestId('version-banner')).toBeNull());
  });

  it('Back to latest reopens the head, editable', async () => {
    render(<VersionBanner />);
    await useHistoryStore.getState().view(v(3, 'manual'));
    await userEvent.click(await screen.findByRole('button', { name: 'Back to latest' }));
    await waitFor(() => expect(useEditorStore.getState().project!.room.width).toBe(4000));
    expect(useEditorStore.getState().readOnly).toBe(false);
    expect(saveVersion).not.toHaveBeenCalled();
  });

  it('viewers can open past versions but not restore them', async () => {
    enter('viewer');
    render(<VersionBanner />);
    await useHistoryStore.getState().view(v(3, 'manual'));
    expect(await screen.findByTestId('version-banner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    expect(await useHistoryStore.getState().restore()).toBe(false);
    expect(saveVersion).not.toHaveBeenCalled();
  });
});
