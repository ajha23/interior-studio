import { Link } from 'react-router-dom';
import type { ProjectSummary } from '../data/projects';
import { relativeTime, STATUS_LABEL } from './format';

export function ProjectCard({ p, actions }: { p: ProjectSummary; actions?: React.ReactNode }) {
  return (
    <article className="pcard">
      <Link to={`/p/${p.id}`} className="pcard-thumb" aria-label={`Open ${p.name}`}>
        <svg viewBox="0 0 120 80" aria-hidden>
          <rect x="14" y="12" width="92" height="56" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M14 40h40M54 12v56M80 40h26" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="pcard-version">v{p.current_version_no}</span>
      </Link>
      <div className="pcard-body">
        <Link to={`/p/${p.id}`} className="pcard-title ellipsis">{p.name}</Link>
        <div className="pcard-meta ellipsis">{p.client_name || 'No client set'}</div>
        <div className="pcard-foot">
          <span className={`chip chip-${p.status}`}>{STATUS_LABEL[p.status]}</span>
          <span className="muted small" title={new Date(p.updated_at).toLocaleString('en-IN')}>
            {relativeTime(p.updated_at)}
            {p.updated_by_name ? ` · ${p.updated_by_name.split(' ')[0]}` : ''}
          </span>
        </div>
        {actions}
      </div>
    </article>
  );
}
