import 'fake-indexeddb/auto';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRow, Result } from '@/infrastructure/projects/cloudProjects';
import type { AppSupabaseClient } from '@/infrastructure/supabase/client';
import * as cache from '@/persistence/cloudCache';
import type { StudioContext } from './studioContext';

const api = {
  listProjects: vi.fn<() => Promise<Result<ProjectRow[]>>>(),
  renameProject: vi.fn(async () => ({ ok: true, value: null }) as Result<null>),
  setArchived: vi.fn(async () => ({ ok: true, value: null }) as Result<null>),
  deleteProject: vi.fn(async () => ({ ok: true, value: null }) as Result<null>),
};
vi.mock('@/infrastructure/projects/cloudProjects', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listProjects: () => api.listProjects(),
  renameProject: (...a: unknown[]) => (api.renameProject as (...x: unknown[]) => unknown)(...a),
  setArchived: (...a: unknown[]) => (api.setArchived as (...x: unknown[]) => unknown)(...a),
  deleteProject: (...a: unknown[]) => (api.deleteProject as (...x: unknown[]) => unknown)(...a),
}));
const { StudioProjects } = await import('./StudioProjects');

const row = (over: Partial<ProjectRow>): ProjectRow => ({
  id: 'p1',
  name: 'Rao kitchen',
  clientName: 'Mrs Rao',
  status: 'design',
  headVersionNo: 3,
  docType: 'kitchen',
  archivedAt: null,
  updatedAt: '2026-11-07T10:00:00Z',
  ownerId: 'u1',
  ownerName: 'Alpha Designer',
  ...over,
});
const ROWS = [row({}), row({ id: 'p2', name: 'Old flat', docType: 'home', archivedAt: '2026-11-01T10:00:00Z', clientName: '' }), row({ id: 'p3', name: 'Legacy', docType: 'legacy_v1' })];
const studio = (role: StudioContext['role']): StudioContext => ({ client: {} as AppSupabaseClient, userId: 'u1', orgId: 'org-a', slug: 'alpha', name: 'Alpha Studio', role });

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

beforeEach(async () => {
  api.listProjects.mockResolvedValue({ ok: true, value: ROWS });
  for (const f of [api.renameProject, api.setArchived, api.deleteProject]) f.mockClear();
  setOnline(true);
  await cache.clearUser('u1');
});
afterEach(() => setOnline(true));

const cardOf = (name: string) => screen.getByRole('heading', { name }).closest('[data-testid="studio-project"]') as HTMLElement;

describe('the studio project list (US1, FR-001)', () => {
  it('lists name, client, status, kind, time and owner; archived ones only when asked', async () => {
    render(<StudioProjects studio={studio('designer')} />);
    const card = await waitFor(() => cardOf('Rao kitchen'));
    expect(card).toHaveTextContent('Mrs Rao · Design · Kitchen · updated');
    expect(card).toHaveTextContent('by Alpha Designer');
    expect(screen.queryByRole('heading', { name: 'Old flat' })).toBeNull();
    await userEvent.click(screen.getByLabelText(/Show archived \(1\)/));
    expect(cardOf('Old flat')).toHaveTextContent('Archived');
    expect(cardOf('Old flat')).toHaveTextContent('Home');
  });

  it('an old-format project explains itself and cannot be opened', async () => {
    render(<StudioProjects studio={studio('designer')} />);
    const card = await waitFor(() => cardOf('Legacy'));
    expect(card).toHaveTextContent('Older format: opens after the import update.');
    expect(within(card).queryByRole('button', { name: 'Open Legacy' })).toBeNull();
  });

  it('offers each role only what it may do', async () => {
    const { unmount } = render(<StudioProjects studio={studio('viewer')} />);
    const viewerCard = await waitFor(() => cardOf('Rao kitchen'));
    expect(within(viewerCard).getByRole('button', { name: 'Open Rao kitchen' })).toBeInTheDocument();
    expect(within(viewerCard).queryByRole('button', { name: /Rename|Archive|Delete/ })).toBeNull();
    unmount();

    render(<StudioProjects studio={studio('designer')} />);
    await userEvent.click(await screen.findByLabelText(/Show archived/));
    expect(within(cardOf('Rao kitchen')).getByRole('button', { name: 'Archive Rao kitchen' })).toBeInTheDocument();
    expect(within(cardOf('Old flat')).getByRole('button', { name: 'Unarchive Old flat' })).toBeInTheDocument();
    expect(within(cardOf('Old flat')).queryByRole('button', { name: 'Delete Old flat' })).toBeNull();
  });

  it('an admin deletes an archived project only after typing its exact name', async () => {
    render(<StudioProjects studio={studio('admin')} />);
    await userEvent.click(await screen.findByLabelText(/Show archived/));
    expect(within(cardOf('Rao kitchen')).queryByRole('button', { name: 'Delete Rao kitchen' })).toBeNull();
    await userEvent.click(within(cardOf('Old flat')).getByRole('button', { name: 'Delete Old flat' }));
    const confirm = screen.getByRole('button', { name: 'Delete for everyone' });
    await userEvent.type(screen.getByLabelText('Project name to delete'), 'old flat');
    expect(confirm).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Project name to delete'));
    await userEvent.type(screen.getByLabelText('Project name to delete'), 'Old flat');
    await userEvent.click(confirm);
    expect(api.deleteProject).toHaveBeenCalledWith(expect.anything(), 'p2');
  });

  it('rename and archive go to the database', async () => {
    render(<StudioProjects studio={studio('designer')} />);
    await userEvent.click(within(await waitFor(() => cardOf('Rao kitchen'))).getByRole('button', { name: 'Rename Rao kitchen' }));
    await userEvent.clear(screen.getByLabelText('New name'));
    await userEvent.type(screen.getByLabelText('New name'), 'Rao kitchen v2{Enter}');
    expect(api.renameProject).toHaveBeenCalledWith(expect.anything(), 'p1', 'Rao kitchen v2');
    await userEvent.click(within(cardOf('Rao kitchen')).getByRole('button', { name: 'Archive Rao kitchen' }));
    expect(api.setArchived).toHaveBeenCalledWith(expect.anything(), 'p1', true);
  });

  it('offline: the last list from this device, and every change disabled with a reason', async () => {
    await cache.putList('u1', 'org-a', [row({ name: 'Cached kitchen' })]);
    setOnline(false);
    render(<StudioProjects studio={studio('designer')} />);
    const card = await waitFor(() => cardOf('Cached kitchen'));
    expect(screen.getByText('Offline — showing the copy on this device')).toBeInTheDocument();
    expect(api.listProjects).not.toHaveBeenCalled();
    for (const b of [within(card).getByRole('button', { name: 'Rename Cached kitchen' }), within(card).getByRole('button', { name: 'Archive Cached kitchen' })]) {
      expect(b).toBeDisabled();
      expect(b).toHaveAttribute('title', "You're offline — this needs a connection.");
    }
    await act(async () => setOnline(true));
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());
  });
});
