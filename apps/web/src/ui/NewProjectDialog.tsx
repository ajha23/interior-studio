import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateProject } from '../data/projects';
import { errorMessage } from '../lib/supabase';

export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
          setName('');
          setClient('');
          setSite('');
          onClose();
          navigate(`/p/${p.id}`);
        }}
      >
        <h2 id="np-title">New project</h2>
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
