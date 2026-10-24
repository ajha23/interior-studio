import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { supabaseConfigured } from './lib/supabase';
import { LoginPage } from './pages/LoginPage';
import { NoAccessPage } from './pages/NoAccessPage';
import { WorkspaceLayout } from './layout/WorkspaceLayout';
import { HomePage } from './pages/HomePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TeamPage } from './pages/TeamPage';
import { FullPageMessage } from './ui/FullPageMessage';

// The editor pulls in Three.js; load it only when a project is opened.
const EditorPage = lazy(() => import('./pages/EditorPage'));

export function App() {
  const { status, activeOrg, error } = useAuth();

  if (!supabaseConfigured) {
    return <FullPageMessage title="Not configured" body="Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY." />;
  }
  if (status === 'loading') return <FullPageMessage title="Loading…" />;
  if (status === 'signed-out') return <LoginPage />;
  if (!activeOrg) return <NoAccessPage error={error} />;

  return (
    <Routes>
      <Route
        path="/p/:projectId"
        element={
          <Suspense fallback={<FullPageMessage title="Opening design…" />}>
            <EditorPage />
          </Suspense>
        }
      />
      <Route element={<WorkspaceLayout />}>
        <Route index element={<HomePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="team" element={<TeamPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
