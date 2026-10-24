import { useEffect, useRef } from 'react';
import { useRoomTemplates, type SavedTemplate } from '../data/templates';
import { errorMessage } from '../lib/supabase';
import { TemplatePreview } from './TemplatePreview';

/** Choose one of the studio's room templates to start a new design from. */
export function TemplatePickerDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t: SavedTemplate) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const templates = useRoomTemplates();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog tpl-dialog" onClose={onClose} aria-labelledby="tp-title">
      <h2 id="tp-title">Start from a template</h2>
      {templates.isLoading && <p className="muted">Loading templates…</p>}
      {templates.error && <p className="form-error">{errorMessage(templates.error)}</p>}
      {templates.data && templates.data.length === 0 && (
        <p className="muted">
          No templates yet. Open a furnished design, select a room and use <strong>Save room as template</strong> in its properties. It will appear here for the whole studio.
        </p>
      )}
      <div className="tpl-pick-grid">
        {templates.data?.map((t) => (
          <button key={t.id} className="tpl-pick" onClick={() => onPick(t)}>
            <TemplatePreview t={t.template} />
            <strong>{t.name}</strong>
            <span>{[t.style, t.roomType].filter(Boolean).join(' · ')} · {t.pieceCount} pieces</span>
          </button>
        ))}
      </div>
      <div className="row gap end">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </dialog>
  );
}
