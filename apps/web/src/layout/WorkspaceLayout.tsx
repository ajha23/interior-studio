import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useProjects } from '../data/projects';

const NAV = [
  { to: '/', label: 'Home', end: true, icon: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
  { to: '/projects', label: 'Projects', end: false, icon: 'M3 7h7l2 2h9v11H3z' },
  { to: '/team', label: 'Team', end: false, icon: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21c0-4 4-6 8-6s8 2 8 6' },
];

export function WorkspaceLayout() {
  const { activeOrg, memberships, setActiveOrg, session, signOut } = useAuth();
  const projects = useProjects();
  const user = session?.user;
  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '';

  return (
    <div className="ws">
      <aside className="ws-side">
        <div className="ws-brand">
          <span className="brand-mark" aria-hidden>IS</span>
          <span>Interior Studio</span>
        </div>

        {memberships.length > 1 ? (
          <select className="ws-org" value={activeOrg?.orgId} onChange={(e) => setActiveOrg(e.target.value)} aria-label="Studio">
            {memberships.map((m) => (
              <option key={m.orgId} value={m.orgId}>{m.orgName}</option>
            ))}
          </select>
        ) : (
          <div className="ws-org-name">{activeOrg?.orgName}</div>
        )}

        <nav className="ws-nav" aria-label="Workspace">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `ws-link${isActive ? ' active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d={n.icon} strokeLinejoin="round" />
              </svg>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="ws-usage">
          <div className="ws-usage-row">
            <span>Plan</span>
            <strong>{activeOrg?.plan === 'inhouse' ? 'In-house' : activeOrg?.plan}</strong>
          </div>
          <div className="ws-usage-row">
            <span>Projects</span>
            <strong>{projects.data?.length ?? '–'}</strong>
          </div>
          <div className="ws-usage-row">
            <span>Your role</span>
            <strong className="cap">{activeOrg?.role}</strong>
          </div>
        </div>

        <div className="ws-user">
          {user?.user_metadata?.avatar_url ? (
            <img src={user.user_metadata.avatar_url as string} alt="" className="avatar" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar avatar-fallback">{name.slice(0, 1).toUpperCase()}</span>
          )}
          <div className="ws-user-text">
            <div className="ellipsis">{name}</div>
            <button className="link-btn" onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </aside>
      <main className="ws-main">
        <Outlet />
      </main>
    </div>
  );
}
