import { useState } from 'react';
import { migrateScene, type Project } from '@studio/core';
import { fetchVersion, useVersions } from '../data/projects';
import { errorMessage } from '../lib/supabase';
import { bytes, relativeTime } from '../ui/format';
import { SCENE_MIGRATIONS } from './migrations';
import { useStudio } from './store';

const KIND_LABEL = { autosave: 'Autosave', manual: 'Saved', revision: 'Revision' } as const;

export function VersionsPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const versions = useVersions(projectId);
  const replaceScene = useStudio((s) => s.replaceScene);
  const readOnly = useStudio((s) => s.readOnly);
  const current = useStudio((s) => s.savedVersionNo);
  const [onlyNamed, setOnlyNamed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = (versions.data ?? []).filter((v) => !onlyNamed || v.kind !== 'autosave');

  return (
    <aside className="versions" aria-label="Version history">
      <div className="versions-head">
        <strong>Version history</strong>
        <button className="btn" onClick={onClose} aria-label="Close history">Close</button>
      </div>
      <label className="versions-filter">
        <input type="checkbox" checked={onlyNamed} onChange={(e) => setOnlyNamed(e.target.checked)} /> Named versions only
      </label>
      {versions.isLoading && <p className="versions-empty">Loading…</p>}
      {versions.error && <p className="versions-empty err">{errorMessage(versions.error)}</p>}
      {error && <p className="versions-empty err">{error}</p>}
      {versions.data && list.length === 0 && <p className="versions-empty">No versions yet.</p>}
      <ol className="versions-list">
        {list.map((v) => (
          <li key={v.id} className={v.version_no === current ? 'cur' : ''}>
            <div className="v-top">
              <span className="v-no num">v{v.version_no}</span>
              <span className={`v-kind ${v.kind}`}>{KIND_LABEL[v.kind]}</span>
              <span className="v-time" title={new Date(v.created_at).toLocaleString('en-IN')}>{relativeTime(v.created_at)}</span>
            </div>
            {v.message && <div className="v-msg">{v.message}</div>}
            <div className="v-meta">
              {v.author ?? 'Unknown'} · {bytes(v.size_bytes)}
            </div>
            {!readOnly && v.version_no !== current && (
              <button
                className="btn"
                disabled={busy !== null}
                onClick={async () => {
                  if (!confirm(`Restore v${v.version_no}? Your current design stays in history and the restore can be undone.`)) return;
                  setBusy(v.id);
                  setError(null);
                  try {
                    const row = await fetchVersion(v.id);
                    const scene = migrateScene<Project>(row.scene, row.schema_version, SCENE_MIGRATIONS);
                    replaceScene(scene, `Restore v${v.version_no}`);
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === v.id ? 'Restoring…' : 'Restore'}
              </button>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
