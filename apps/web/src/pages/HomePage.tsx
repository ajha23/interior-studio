import { useState } from 'react';
import { Link } from 'react-router-dom';
import { canEdit, useAuth } from '../auth/AuthProvider';
import { useProjects } from '../data/projects';
import { errorMessage } from '../lib/supabase';
import { NewProjectDialog } from '../ui/NewProjectDialog';
import { ProjectCard } from '../ui/ProjectCard';

const STARTS = [
  {
    title: 'Measured room',
    body: 'Enter site measurements, place doors and windows, then add furniture.',
    soon: false,
  },
  {
    title: 'Trace a floor plan',
    body: 'Import a plan image or DWG and trace walls in 2D.',
    soon: true,
  },
  {
    title: 'Start from a template',
    body: 'Apply a whole-room style template and adapt it.',
    soon: true,
  },
];

export function HomePage() {
  const { session, activeOrg } = useAuth();
  const projects = useProjects();
  const [open, setOpen] = useState(false);
  const first = ((session?.user.user_metadata?.full_name as string | undefined) ?? '').split(' ')[0];
  const editable = canEdit(activeOrg?.role);

  return (
    <div className="page">
      <header className="page-head">
        <h1>{first ? `Hello, ${first}` : 'Home'}</h1>
        {editable && (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>+ New project</button>
        )}
      </header>

      {editable && (
        <section aria-labelledby="start-h">
          <h2 id="start-h" className="section-h">Start a design</h2>
          <div className="starts">
            {STARTS.map((s) => (
              <button key={s.title} className="start" disabled={s.soon} onClick={() => setOpen(true)}>
                <strong>{s.title}</strong>
                <span>{s.body}</span>
                {s.soon && <em className="chip">Phase 1</em>}
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="recent-h">
        <div className="section-row">
          <h2 id="recent-h" className="section-h">Recent designs</h2>
          <Link to="/projects" className="link">View all</Link>
        </div>
        {projects.isLoading && <p className="muted">Loading projects…</p>}
        {projects.error && <p className="form-error">{errorMessage(projects.error)}</p>}
        {projects.data && projects.data.length === 0 && (
          <div className="empty">
            <p>No projects yet.</p>
            {editable && <button className="btn" onClick={() => setOpen(true)}>Create the first one</button>}
          </div>
        )}
        <div className="grid">
          {projects.data?.slice(0, 8).map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      </section>

      <NewProjectDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
