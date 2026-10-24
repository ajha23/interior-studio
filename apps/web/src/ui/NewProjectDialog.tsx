import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { emptyProject, projectFromTemplate, SCHEMA_VERSION, type RoomTemplate } from '@studio/core';
import { saveScene, useCreateProject } from '../data/projects';
import { errorMessage } from '../lib/supabase';

/** How the new design starts: the default single measured room, an empty plan to trace, or a room template. */
export type ProjectStart = { kind: 'measured' } | { kind: 'trace' } | { kind: 'template'; name: string; roomType: string; template: RoomTemplate };

export function NewProjectDialog({ open, onClose, start = { kind: 'measured' } }: { open: boolean; onClose: () => void; start?: ProjectStart }) {
  const ref = useRef<HTMLDialogElement>(null);
  const create = useCreateProject();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [site, setSite] = useState('');

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="np-title">
      <form
        method="dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const p = await create.mutateAsync({ name: name.trim(), client_name: client.trim(), site_address: site.trim() });
          // Template and trace starts save their first version here; a measured room is created by the editor.
          if (start.kind !== 'measured') {
            const scene =
              start.kind === 'template'
                ? { ...projectFromTemplate(name.trim(), client.trim(), start.template, start.roomType || 'Room 1'), id: p.id }
                : { ...emptyProject(name.trim(), client.trim()), id: p.id };
            await saveScene({ projectId: p.id, scene, schemaVersion: SCHEMA_VERSION, kind: 'manual', message: start.kind === 'template' ? `Started from template “${start.name}”` : 'Started for tracing' }, null);
          }
          setName('');
          setClient('');
          setSite('');
          onClose();
          navigate(`/p/${p.id}`);
        }}
      >
        <h2 id="np-title">New project</h2>
        {start.kind === 'template' && <p className="muted small">Starts with one room of {Math.round(start.template.widthUm / 1000)} × {Math.round(start.template.depthUm / 1000)} mm furnished from “{start.name}”. Resize the walls afterwards; pieces against a wall follow it.</p>}
        {start.kind === 'trace' && <p className="muted small">Opens an empty plan. Upload the architect’s PDF or image, set its scale, then draw the walls over it.</p>}
        <label className="field">
          <span>Project name</span>
          <input autoFocus required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sharma residence – master bedroom" />
        </label>
        <label className="field">
          <span>Client</span>
          <input maxLength={160} value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client name" />
        </label>
        <label className="field">
          <span>Site address</span>
          <input maxLength={300} value={site} onChange={(e) => setSite(e.target.value)} placeholder="Flat, building, area, city" />
        </label>
        {create.error && <p className="form-error" role="alert">{errorMessage(create.error)}</p>}
        <div className="row gap end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending || !name.trim()}>
            {create.isPending ? 'Creating…' : 'Create and open'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
