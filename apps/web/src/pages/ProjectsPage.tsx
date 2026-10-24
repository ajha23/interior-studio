import { useMemo, useState } from 'react';
import { canAdmin, canEdit, useAuth } from '../auth/AuthProvider';
import { useProjects, useUpdateProject } from '../data/projects';
import type { ProjectStatusT } from '../lib/database.types';
import { errorMessage } from '../lib/supabase';
import { STATUS_LABEL } from '../ui/format';
import { NewProjectDialog } from '../ui/NewProjectDialog';
import { ProjectCard } from '../ui/ProjectCard';

const STATUSES: ProjectStatusT[] = ['lead', 'design', 'approved', 'production', 'installed'];

export function ProjectsPage() {
  const { activeOrg } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProjectStatusT | 'all'>('all');
  const [open, setOpen] = useState(false);
  const projects = useProjects({ includeArchived: showArchived });
  const update = useUpdateProject();
  const editable = canEdit(activeOrg?.role);
  const admin = canAdmin(activeOrg?.role);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (projects.data ?? []).filter(
      (p) =>
        (status === 'all' || p.status === status) &&
        (!q || p.name.toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q) || p.site_address.toLowerCase().includes(q)),
    );
  }, [projects.data, query, status]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Projects</h1>
        {editable && <button className="btn btn-primary" onClick={() => setOpen(true)}>+ New project</button>}
      </header>

      <div className="toolbar">
        <input className="search" type="search" placeholder="Search name, client or site" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search projects" />
        <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatusT | 'all')} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        <span className="muted small push">{filtered.length} of {projects.data?.length ?? 0}</span>
      </div>

      {projects.error && <p className="form-error">{errorMessage(projects.error)}</p>}
      {update.error && <p className="form-error">{errorMessage(update.error)}</p>}
      {projects.isLoading && <p className="muted">Loading…</p>}
      {projects.data && filtered.length === 0 && <div className="empty"><p>No projects match.</p></div>}

      <div className="grid">
        {filtered.map((p) => (
          <ProjectCard
            key={p.id}
            p={p}
            actions={
              editable && (
                <div className="pcard-actions">
                  <select
                    aria-label={`Status of ${p.name}`}
                    value={p.status}
                    onChange={(e) => update.mutate({ id: p.id, patch: { status: e.target.value as ProjectStatusT } })}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  {admin && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        update.mutate({ id: p.id, patch: { archived_at: p.archived_at ? null : new Date().toISOString() } })
                      }
                    >
                      {p.archived_at ? 'Restore' : 'Archive'}
                    </button>
                  )}
                </div>
              )
            }
          />
        ))}
      </div>
      <NewProjectDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
