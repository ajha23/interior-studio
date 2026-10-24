import { useEffect, useMemo, useState } from 'react';
import { liveHash, useStudio } from './store';
import { isParametric, type Project, type RevisionStatus, type TvUnitItem, type WardrobeItem } from '@studio/core';
import { fmtMm, plainMm } from '@studio/core';
import { buildSchedule, scheduleCsv } from '@studio/core';
import { Elevation } from './Elevation';
import { useValidation } from './hooks';
import { PlanDrawing } from './PlanView';

function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useRevisionState(project: Project) {
  const [hash, setHash] = useState<string>('');
  useEffect(() => {
    let alive = true;
    liveHash(project).then((h) => alive && setHash(h));
    return () => {
      alive = false;
    };
  }, [project]);
  const latest = project.revisions.at(-1);
  const changed = !latest || latest.hash !== hash;
  const revLabel = latest ? `Rev ${latest.rev}${changed ? ' + unissued changes' : ''}` : 'Draft — not issued';
  const status = !latest || changed ? 'Preliminary' : latest.status === 'released' ? 'Released for manufacture' : 'Design approved';
  return { hash, latest, changed, revLabel, status };
}

function TitleBlock({ project, drawing, number, rev }: { project: Project; drawing: string; number: string; rev: ReturnType<typeof useRevisionState> }) {
  return (
    <div className="title-block">
      <div>
        <div className="k">Project · Client</div>
        <div className="v">{project.name}</div>
        <div>{project.client}</div>
      </div>
      <div>
        <div className="k">Drawing</div>
        <div className="v">{drawing}</div>
        <div className="num">{number}</div>
      </div>
      <div>
        <div className="k">Revision</div>
        <div className="v">{rev.revLabel}</div>
        <div>{rev.status}</div>
      </div>
      <div>
        <div className="k">Units · Rules</div>
        <div className="v">mm · NTS</div>
        <div className="num">{project.rulePack.id} v{project.rulePack.version}</div>
      </div>
      <div>
        <div className="k">Fingerprint · Date</div>
        <div className="v num">{rev.hash.slice(0, 12) || '…'}</div>
        <div>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      </div>
    </div>
  );
}

function FurnitureSheet({ project, item, index, rev }: { project: Project; item: WardrobeItem | TvUnitItem; index: number; rev: ReturnType<typeof useRevisionState> }) {
  const { rows, totals, resolved } = useMemo(() => buildSchedule(item, project.rulePack), [item, project.rulePack]);
  const errors = resolved.issues.filter((i) => i.severity === 'error');
  return (
    <section className="sheet">
      <div className="sheet-title">
        <h3>{item.name}</h3>
        <span className="sub num">
          {fmtMm(item.params.widthUm)} W × {fmtMm(item.params.heightUm)} H × {fmtMm(item.params.depthUm)} D · {resolved.templateKey} template v{resolved.templateVersion}
        </span>
        <span className="spacer" />
        <button className="btn no-print" onClick={() => download(`${project.name} - ${item.name} - cut list.csv`.replace(/[\\/:*?"<>|]/g, '-'), scheduleCsv(item, project.rulePack, project.name, rev.revLabel))}>
          Download cut list (CSV)
        </button>
      </div>
      <div className="drawings">
        <figure>
          <Elevation item={item} r={resolved} mode="front" />
          <figcaption>Front elevation</figcaption>
        </figure>
        <figure>
          <Elevation item={item} r={resolved} mode="internal" />
          <figcaption>Internal elevation (fronts removed)</figcaption>
        </figure>
        <figure style={{ width: 200 }}>
          <Elevation item={item} r={resolved} mode="side" />
          <figcaption>Side section</figcaption>
        </figure>
      </div>
      {errors.length > 0 && <div className="notice" style={{ background: 'var(--error-tint)', color: '#7a2416' }}>Not buildable as drawn: {errors.map((e) => e.message).join(' ')}</div>}
      <div className="sched-grid">
        <table className="sched">
          <thead>
            <tr>
              <th>Mark</th>
              <th>Part</th>
              <th className="r">Qty</th>
              <th className="r">L</th>
              <th className="r">W</th>
              <th className="r">T</th>
              <th>Material</th>
              <th>Grain</th>
              <th>Edge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mark}>
                <td className="num">{r.mark}</td>
                <td>{r.name}</td>
                <td className="r num">{r.qty}</td>
                <td className="r num">{plainMm(r.lengthUm)}</td>
                <td className="r num">{plainMm(r.widthUm)}</td>
                <td className="r num">{plainMm(r.thicknessUm)}</td>
                <td>{r.material}</td>
                <td>{r.grain}</td>
                <td className="num">{r.edgeBanding}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <table className="sched">
            <thead>
              <tr>
                <th>Hardware</th>
                <th>Spec</th>
                <th className="r">Qty</th>
              </tr>
            </thead>
            <tbody>
              {resolved.hardware.map((h, i) => (
                <tr key={i}>
                  <td>{h.name}</td>
                  <td>{h.spec}</td>
                  <td className="r num">{h.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="sched">
            <thead>
              <tr>
                <th>Board</th>
                <th className="r">m²</th>
                <th className="r">Sheets*</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t, i) => (
                <tr key={i}>
                  <td>{t.material}</td>
                  <td className="r num">{t.areaM2.toFixed(2)}</td>
                  <td className="r num">{t.sheets}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="field-hint" style={{ marginTop: 6 }}>
            Finished sizes in mm incl. edge banding. *8 × 4 ft sheets with 15% waste — estimate only, not a nesting plan. Edge code: L = long edge, S = short edge.
          </div>
        </div>
      </div>
      {rev.status !== 'Released for manufacture' && <div className="notice">Preliminary — generated from construction rules “{project.rulePack.name}” v{project.rulePack.version}. A qualified reviewer must verify joinery and site measurements before release.</div>}
      <TitleBlock project={project} drawing={`${item.name} — elevations & cut list`} number={`IS-F${String(index + 1).padStart(2, '0')}`} rev={rev} />
    </section>
  );
}

export function DocsView() {
  const project = useStudio((s) => s.project);
  const issueRevision = useStudio((s) => s.issueRevision);
  const results = useValidation();
  const rev = useRevisionState(project);
  const [dialog, setDialog] = useState(false);
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<RevisionStatus>('design-approved');
  const errors = results.filter((r) => r.severity === 'error');
  const parametric = project.furniture.filter(isParametric);
  const room = project.room;
  const T = room.wallThicknessUm / 1000;
  const pad = 700;
  const vbW = room.widthUm / 1000 + 2 * T + 2 * pad;
  const vbH = room.depthUm / 1000 + 2 * T + 2 * pad;
  const fs = Math.max(vbW, vbH) / 70;
  const blocked = status === 'released' && errors.length > 0;

  return (
    <div className="docs">
      <div className="docs-head">
        <h2>Drawings & schedules</h2>
        <span className={`badge ${rev.changed ? 'draft' : 'ok'}`}>{rev.revLabel}</span>
        <div className="rev-list">
          {project.revisions.map((r) => (
            <span key={r.rev} className={`rev ${r.status}`} title={`${new Date(r.createdAt).toLocaleString()} · ${r.hash.slice(0, 12)}`}>
              Rev {r.rev} · {r.status === 'released' ? 'Released' : 'Approved'}
            </span>
          ))}
        </div>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={() => {
          setLabel(`Rev ${(project.revisions.at(-1)?.rev ?? 0) + 1}`);
          setDialog(true);
        }}>
          Issue revision…
        </button>
        <button className="btn primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <section className="sheet">
        <div className="sheet-title">
          <h3>Floor plan — {room.name}</h3>
          <span className="sub num">
            {fmtMm(room.widthUm)} × {fmtMm(room.depthUm)} · ceiling {fmtMm(room.ceilingUm)} · {room.source === 'site_measured' ? 'site measured' : room.source === 'drawing' ? 'from supplied drawing' : 'ESTIMATED — verify on site'}
          </span>
        </div>
        <svg className="drawing-svg" viewBox={`${-T - pad} ${-T - pad} ${vbW} ${vbH}`} style={{ maxHeight: 560 }}>
          <PlanDrawing project={project} selection={null} fs={fs} interactive={false} />
        </svg>
        <TitleBlock project={project} drawing="Furnished floor plan" number="IS-A01" rev={rev} />
      </section>

      {parametric.length === 0 && <div className="sheet empty">Add a wardrobe or TV unit to generate elevations and a cut list. Catalogue furniture (beds, sofas, tables) is visual only and never appears in manufacturing documents.</div>}
      {parametric.map((item, i) => (
        <FurnitureSheet key={item.id} project={project} item={item} index={i} rev={rev} />
      ))}

      {dialog && (
        <div className="backdrop" onClick={() => setDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Issue revision</h2>
            <p className="sub">Freezes an immutable snapshot of the room, furniture and construction rules with a SHA-256 fingerprint. Later edits show as unissued changes.</p>
            <div className="field">
              <label>Label</label>
              <div className="inp"><input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
            </div>
            <div className="field">
              <label>Status</label>
              <div className="inp">
                <select value={status} onChange={(e) => setStatus(e.target.value as RevisionStatus)}>
                  <option value="design-approved">Design approved (client)</option>
                  <option value="released">Released for manufacture</option>
                </select>
              </div>
            </div>
            {blocked && (
              <div className="issue error" style={{ marginTop: 8 }}>
                <span className="dot error" /> Release blocked: {errors.length} validation error{errors.length > 1 ? 's' : ''} must be fixed first.
              </div>
            )}
            {status === 'released' && !blocked && <div className="notice">Confirm the construction details and site measurements have been reviewed by a qualified person.</div>}
            <div className="btn-row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDialog(false)}>Cancel</button>
              <button
                className="btn primary"
                disabled={blocked || !label.trim()}
                onClick={async () => {
                  await issueRevision(label.trim(), status);
                  setDialog(false);
                }}
              >
                Issue {label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
