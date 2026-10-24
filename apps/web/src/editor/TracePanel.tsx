import { useRef, useState } from 'react';
import { mm } from '@studio/core';
import { uploadPlanImage } from '../data/underlay';
import { useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../lib/supabase';
import { useStudio } from './store';

/** Guess for a plan's real width before calibration: a typical apartment drawing. */
const DEFAULT_WIDTH = mm(12000);

function useUploadUnderlay() {
  const { activeOrg } = useAuth();
  const dispatch = useStudio((s) => s.dispatch);
  const setTool = useStudio((s) => s.setTool);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (file: File) => {
    if (!activeOrg) return;
    setError(null);
    setBusy(true);
    try {
      const img = await uploadPlanImage(activeOrg.orgId, file);
      const prev = useStudio.getState().project.underlay;
      dispatch(
        { type: 'underlay.set', underlay: { path: img.path, pxWidth: img.pxWidth, pxHeight: img.pxHeight, xUm: prev?.xUm ?? 0, yUm: prev?.yUm ?? 0, widthUm: prev?.widthUm ?? DEFAULT_WIDTH, opacity: prev?.opacity ?? 0.55, visible: true } },
        'Add floor plan to trace',
      );
      // Straight into scale calibration: the image means nothing until it's to scale.
      setTool('calibrate');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy, error };
}

function FilePick({ label, onFile, busy, primary }: { label: string; onFile: (f: File) => void; busy: boolean; primary?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,.dwg,.dxf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
      <button className={`btn ${primary ? 'primary' : ''}`} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? 'Reading the plan…' : label}
      </button>
    </>
  );
}

/** Shown over an empty plan: start by tracing a drawing, or draw from scratch. */
export function TraceStart() {
  const { upload, busy, error } = useUploadUnderlay();
  const setTool = useStudio((s) => s.setTool);
  return (
    <div className="trace-start" role="region" aria-label="Start the plan">
      <strong>Start the floor plan</strong>
      <p>Upload the architect’s plan (PDF, JPG or PNG) and trace the walls over it, or draw from scratch.</p>
      <div className="btn-row">
        <FilePick label="Upload a plan to trace" onFile={upload} busy={busy} primary />
        <button className="btn" onClick={() => setTool('room')}>Draw a room (M)</button>
        <button className="btn" onClick={() => setTool('wall')}>Draw walls (W)</button>
      </div>
      {error && <p className="trace-err" role="alert">{error}</p>}
    </div>
  );
}

/** Plan-settings section for the traced image: replace, scale, opacity, show/hide, remove. */
export function TraceSettings() {
  const u = useStudio((s) => s.project.underlay);
  const tool = useStudio((s) => s.tool);
  const setTool = useStudio((s) => s.setTool);
  const dispatch = useStudio((s) => s.dispatch);
  const readOnly = useStudio((s) => s.readOnly);
  const { upload, busy, error } = useUploadUnderlay();
  if (readOnly) return null;
  return (
    <div className="section">
      <h3>Trace a floor plan</h3>
      {!u ? (
        <>
          <FilePick label="Upload a plan (PDF, JPG, PNG)" onFile={upload} busy={busy} />
          <div className="field-hint">The first page of a PDF is used. DWG: plot to PDF from AutoCAD first.</div>
        </>
      ) : (
        <>
          <div className="btn-row">
            <button className={`btn ${tool === 'calibrate' ? 'on' : ''}`} onClick={() => setTool(tool === 'calibrate' ? 'select' : 'calibrate')}>
              {tool === 'calibrate' ? 'Click two points…' : 'Set scale'}
            </button>
            <button className="btn" onClick={() => dispatch({ type: 'underlay.set', underlay: { ...u, visible: !u.visible } }, u.visible ? 'Hide traced plan' : 'Show traced plan')}>
              {u.visible ? 'Hide' : 'Show'}
            </button>
            <FilePick label="Replace" onFile={upload} busy={busy} />
            <button className="btn danger" onClick={() => dispatch({ type: 'underlay.set', underlay: null }, 'Remove traced plan')}>Remove</button>
          </div>
          <label className="light-row">
            <span>Opacity</span>
            <input type="range" min={0.1} max={1} step={0.05} value={u.opacity} onChange={(e) => dispatch({ type: 'underlay.set', underlay: { ...u, opacity: Number(e.target.value) } }, 'Change plan opacity')} />
            <span className="num">{Math.round(u.opacity * 100)}%</span>
          </label>
          <div className="field-hint">
            Image width {Math.round(u.widthUm / 1000).toLocaleString()} mm. Set the scale with a long wall you know, then draw walls (W) or rooms (M) over it — walls snap to each other, not to the image.
          </div>
          <div className="btn-row">
            {(['←', '→', '↑', '↓'] as const).map((a) => (
              <button
                key={a}
                className="btn"
                title="Nudge the image 50 mm"
                onClick={() => {
                  const d = mm(50);
                  const dx = a === '←' ? -d : a === '→' ? d : 0;
                  const dy = a === '↑' ? -d : a === '↓' ? d : 0;
                  dispatch({ type: 'underlay.set', underlay: { ...u, xUm: u.xUm + dx, yUm: u.yUm + dy } }, 'Move traced plan');
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </>
      )}
      {error && <div className="field-hint" style={{ color: 'var(--error)' }}>{error}</div>}
    </div>
  );
}
