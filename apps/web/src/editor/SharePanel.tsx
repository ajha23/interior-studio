import { useState } from 'react';
import { shareUrl, useCreateShareLink, useRevokeShareLink, useShareLinks, type ShareLink } from '../data/shares';
import { useVersions } from '../data/projects';
import { errorMessage } from '../lib/supabase';
import { relativeTime } from '../ui/format';
import { useStudio } from './store';

const EXPIRY = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 0, label: 'Never' },
];

export function SharePanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const links = useShareLinks(projectId);
  const versions = useVersions(projectId);
  const create = useCreateShareLink(projectId);
  const revoke = useRevokeShareLink(projectId);
  const readOnly = useStudio((s) => s.readOnly);
  const saveState = useStudio((s) => s.saveState);
  const saveNow = useStudio((s) => s.saveNow);
  const [label, setLabel] = useState('');
  const [pin, setPin] = useState<'latest' | 'current'>('latest');
  const [expiry, setExpiry] = useState(30);
  const [showPlan, setShowPlan] = useState(true);
  const [showRenders, setShowRenders] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);

  const latestVersion = versions.data?.[0];

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
    } catch {
      prompt('Copy this link', shareUrl(token));
    }
  };

  const make = async () => {
    // The link shows saved versions; make sure the latest edits are in one.
    if (saveState === 'dirty') await saveNow('autosave');
    const versionId = pin === 'current' ? (versions.data?.[0]?.id ?? null) : null;
    const token = await create.mutateAsync({ label: label.trim(), versionId, showPlan, showRenders, expiresInDays: expiry || null });
    setLabel('');
    void copy(token);
  };

  const visible = (links.data ?? []).filter((l) => showRevoked || !isDead(l));

  return (
    <aside className="versions share" aria-label="Share with client">
      <div className="versions-head">
        <strong>Share with client</strong>
        <button className="btn" onClick={onClose} aria-label="Close sharing">Close</button>
      </div>
      {!readOnly && (
        <div className="render-form">
          <input className="input" placeholder="Who is it for? e.g. Mehta family — option A" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
          <label className="share-opt">
            <span>Shows</span>
            <select className="input" value={pin} onChange={(e) => setPin(e.target.value as 'latest' | 'current')}>
              <option value="latest">Always the latest saved design</option>
              <option value="current" disabled={!latestVersion}>This version only{latestVersion ? ` (v${latestVersion.version_no})` : ''}</option>
            </select>
          </label>
          <label className="share-opt">
            <span>Expires</span>
            <select className="input" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
              {EXPIRY.map((x) => (
                <option key={x.days} value={x.days}>{x.label}</option>
              ))}
            </select>
          </label>
          <label className="versions-filter"><input type="checkbox" checked={showPlan} onChange={(e) => setShowPlan(e.target.checked)} /> Include the floor plan</label>
          <label className="versions-filter"><input type="checkbox" checked={showRenders} onChange={(e) => setShowRenders(e.target.checked)} /> Include saved renders</label>
          <button className="btn primary" disabled={create.isPending} onClick={() => void make()}>
            {create.isPending ? 'Creating…' : 'Create link & copy'}
          </button>
          {create.error && <p className="versions-empty err">{errorMessage(create.error)}</p>}
          <p className="render-hint">Anyone with the link can view the design in 3D, without signing in. They can't edit, see other projects, or see cut lists and prices. Revoke a link at any time.</p>
        </div>
      )}
      {links.isLoading && <p className="versions-empty">Loading…</p>}
      {links.error && <p className="versions-empty err">{errorMessage(links.error)}</p>}
      {links.data && links.data.length === 0 && <p className="versions-empty">No links yet.</p>}
      {links.data?.some(isDead) && (
        <label className="versions-filter"><input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} /> Show revoked and expired</label>
      )}
      <ul className="share-list">
        {visible.map((l) => {
          const dead = isDead(l);
          const pinned = l.version_id ? versions.data?.find((v) => v.id === l.version_id)?.version_no : null;
          return (
            <li key={l.id} className={dead ? 'dead' : ''}>
              <div className="v-top">
                <strong className="share-label">{l.label || 'Untitled link'}</strong>
                <span className={`v-kind ${dead ? 'autosave' : 'manual'}`}>{l.revoked_at ? 'Revoked' : dead ? 'Expired' : 'Live'}</span>
              </div>
              <div className="share-meta">
                {l.version_id ? `Pinned to v${pinned ?? '?'}` : 'Latest design'} · {l.view_count} view{l.view_count === 1 ? '' : 's'}
                {l.last_viewed_at ? ` · last ${relativeTime(l.last_viewed_at)}` : ''} · {l.expires_at ? `expires ${new Date(l.expires_at).toLocaleDateString()}` : 'no expiry'}
              </div>
              {!dead && (
                <div className="btn-row">
                  <button className="btn" onClick={() => void copy(l.token)}>{copied === l.token ? 'Copied ✓' : 'Copy link'}</button>
                  <a className="btn" href={shareUrl(l.token)} target="_blank" rel="noreferrer">Preview</a>
                  {!readOnly && <button className="btn danger" onClick={() => confirm('Revoke this link? Anyone using it loses access immediately.') && revoke.mutate(l.id)}>Revoke</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function isDead(l: ShareLink): boolean {
  return Boolean(l.revoked_at) || (l.expires_at !== null && new Date(l.expires_at).getTime() < Date.now());
}
