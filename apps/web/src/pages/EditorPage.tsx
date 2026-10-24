import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { blankProject, migrateScene, SCHEMA_VERSION, sceneHash, type Project } from '@studio/core';
import { canEdit, useAuth } from '../auth/AuthProvider';
import { fetchLatestScene, saveScene, useProject, useUpdateProject } from '../data/projects';
import { errorMessage } from '../lib/supabase';
import { FullPageMessage } from '../ui/FullPageMessage';
import { EditorShell } from '../editor/EditorShell';
import { VersionsPanel } from '../editor/VersionsPanel';
import { clearDraft, readDraft, useStudio, type RemoteSaver } from '../editor/store';
import { SCENE_MIGRATIONS } from '../editor/migrations';
import '../editor/editor.css';


type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeOrg } = useAuth();
  const projectQ = useProject(projectId);
  const updateProject = useUpdateProject();
  const hydrate = useStudio((s) => s.hydrate);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [historyOpen, setHistoryOpen] = useState(false);
  const lastHash = useRef<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  const readOnly = !canEdit(activeOrg?.role);

  const saver = useCallback<RemoteSaver>(
    async (project, kind, message) => {
      const row = await saveScene({ projectId: projectId!, scene: project, schemaVersion: SCHEMA_VERSION, kind, message }, lastHash.current);
      if (!row) return null;
      lastHash.current = row.scene_hash;
      void qc.invalidateQueries({ queryKey: ['versions', projectId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
      return { versionNo: row.version_no };
    },
    [projectId, qc],
  );

  useEffect(() => {
    const row = projectQ.data;
    if (!row || loadedFor.current === row.id) return;
    loadedFor.current = row.id;
    (async () => {
      try {
        const latest = await fetchLatestScene(row);
        let scene: Project;
        let versionNo = 0;
        if (latest) {
          scene = migrateScene<Project>(latest.scene, latest.schema_version, SCENE_MIGRATIONS);
          versionNo = latest.version_no;
          lastHash.current = latest.schema_version === SCHEMA_VERSION ? latest.scene_hash : null;
        } else {
          scene = blankProject(row.name, row.client_name || '—');
          lastHash.current = null;
        }
        scene = { ...scene, id: row.id, name: row.name };

        const draft = readOnly ? null : readDraft(row.id);
        if (draft) {
          const draftHash = await sceneHash(draft.project);
          const newer = !latest || new Date(draft.savedAt) > new Date(latest.created_at);
          if (newer && draftHash !== lastHash.current && confirm('This browser has unsaved changes to this design from an earlier session. Restore them?')) {
            scene = { ...draft.project, id: row.id };
          } else {
            clearDraft(row.id);
          }
        }

        hydrate(scene, { versionNo, readOnly, saver });
        setLoad({ kind: 'ready' });
        // A brand-new project gets its first version straight away so it appears in history.
        if (!latest && !readOnly) void useStudio.getState().saveNow('manual', 'Created');
      } catch (e) {
        setLoad({ kind: 'error', message: errorMessage(e) });
      }
    })();
  }, [projectQ.data, hydrate, readOnly, saver]);

  // Flush and warn before leaving with unsaved work.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useStudio.getState().saveState;
      if (s === 'dirty' || s === 'saving' || s === 'error') {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const goBack = async () => {
    const s = useStudio.getState();
    if (s.saveState === 'dirty') await s.saveNow('autosave');
    navigate('/projects');
  };

  if (projectQ.error) {
    return (
      <FullPageMessage title="Can't open this project" body={errorMessage(projectQ.error)}>
        <button className="btn" onClick={() => navigate('/projects')}>Back to projects</button>
      </FullPageMessage>
    );
  }
  if (load.kind === 'error') {
    return (
      <FullPageMessage title="Can't load this design" body={load.message}>
        <button className="btn" onClick={() => navigate('/projects')}>Back to projects</button>
      </FullPageMessage>
    );
  }
  if (load.kind === 'loading' || !projectQ.data) return <FullPageMessage title="Opening design…" />;

  return (
    <EditorShell
      chrome={{
        onBack: () => void goBack(),
        onRename: (name) => updateProject.mutate({ id: projectId!, patch: { name } }),
        onToggleHistory: () => setHistoryOpen((o) => !o),
        historyOpen,
        drawer: historyOpen ? <VersionsPanel projectId={projectId!} onClose={() => setHistoryOpen(false)} /> : null,
      }}
    />
  );
}
