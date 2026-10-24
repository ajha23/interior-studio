import { useMemo, useState } from 'react';
import {
  captureRoomTemplate,
  furnitureInRoom,
  instantiateRoomTemplate,
  templatedRoomInfo,
  type Command,
  type DetectedRoom,
  type RoomTemplate,
} from '@studio/core';
import { TemplatePreview } from '../ui/TemplatePreview';
export { TemplatePreview };
import { useDeleteRoomTemplate, useRoomTemplates, useSaveRoomTemplate, type SavedTemplate } from '../data/templates';
import { canAdmin as roleCanAdmin, useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../lib/supabase';
import { useStudio } from './store';
import { useRooms } from './hooks';

export const STYLES = ['Modern', 'Contemporary', 'Minimal', 'Scandinavian', 'Traditional Indian', 'Indo-modern', 'Industrial', 'Boho', 'Luxury', 'Classic'];
export const ROOM_TYPES = ['Living', 'Bedroom', 'Kids', 'Dining', 'Kitchen', 'Bath', 'Study', 'Pooja', 'Foyer', 'Balcony'];

/** Commands that apply a template to a room, as one undoable step. */
export function applyTemplateCommand(t: RoomTemplate, room: DetectedRoom, existing: ReturnType<typeof useStudio.getState>['project']['furniture'], mode: 'add' | 'replace'): { cmd: Command; roomId: string } {
  const items = instantiateRoomTemplate(t, room);
  const info = templatedRoomInfo(t, room);
  const removals: Command[] = mode === 'replace' ? furnitureInRoom(existing, room).map((f) => ({ type: 'furniture.remove', id: f.id })) : [];
  return {
    roomId: info.id,
    cmd: {
      type: 'batch',
      label: `Apply template to ${room.info.name}`,
      commands: [{ type: 'room.upsert', info }, ...removals, ...items.map((item): Command => ({ type: 'furniture.add', item }))],
    },
  };
}

/** "Save this room as a template", shown in room properties. */
export function SaveTemplateForm({ room }: { room: DetectedRoom }) {
  const furniture = useStudio((s) => s.project.furniture);
  const save = useSaveRoomTemplate();
  const [name, setName] = useState('');
  const [style, setStyle] = useState(STYLES[0]);
  const [roomType, setRoomType] = useState(guessType(room.info.name));
  const [saved, setSaved] = useState(false);
  const count = useMemo(() => furnitureInRoom(furniture, room).length, [furniture, room]);
  return (
    <div className="section">
      <h3>Style template</h3>
      <input className="input" placeholder={`${style} ${roomType.toLowerCase()}`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-label="Template name" />
      <div className="tpl-row">
        <select className="input" value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Style">
          {STYLES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input" value={roomType} onChange={(e) => setRoomType(e.target.value)} aria-label="Room type">
          {ROOM_TYPES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <button
        className="btn"
        disabled={save.isPending}
        onClick={() =>
          save.mutate(
            { name: name.trim() || `${style} ${roomType.toLowerCase()}`, style, roomType, template: captureRoomTemplate(room, furniture) },
            { onSuccess: () => { setSaved(true); setName(''); setTimeout(() => setSaved(false), 2500); } },
          )
        }
      >
        {save.isPending ? 'Saving…' : saved ? 'Saved to studio templates ✓' : `Save room as template (${count} piece${count === 1 ? '' : 's'})`}
      </button>
      {save.error && <div className="field-hint" style={{ color: 'var(--error)' }}>{errorMessage(save.error)}</div>}
      <div className="field-hint">Saves the floor, walls and furniture so anyone in the studio can apply them to another room. Pieces against a wall stay against it in rooms of other sizes.</div>
    </div>
  );
}

function guessType(name: string): string {
  const n = name.toLowerCase();
  return ROOM_TYPES.find((t) => n.includes(t.toLowerCase())) ?? (n.includes('master') || n.includes('guest') ? 'Bedroom' : 'Living');
}

/** Studio templates, shown as a Catalogue chip. */
export function TemplatesList({ query }: { query: string }) {
  const templates = useRoomTemplates();
  const del = useDeleteRoomTemplate();
  const { activeOrg } = useAuth();
  const canAdmin = roleCanAdmin(activeOrg?.role);
  const rooms = useRooms();
  const selection = useStudio((s) => s.selection);
  const readOnly = useStudio((s) => s.readOnly);
  const dispatch = useStudio((s) => s.dispatch);
  const select = useStudio((s) => s.select);
  const [style, setStyle] = useState('All');
  const target = (selection?.kind === 'room' && rooms.find((r) => r.id === selection.id)) || rooms[0];
  const list = (templates.data ?? []).filter(
    (t) => (style === 'All' || t.style === style) && (!query || `${t.name} ${t.style} ${t.roomType}`.toLowerCase().includes(query.toLowerCase())),
  );
  const apply = (t: SavedTemplate, mode: 'add' | 'replace') => {
    if (!target) return;
    const project = useStudio.getState().project;
    const { cmd, roomId } = applyTemplateCommand(t.template, target, project.furniture, mode);
    dispatch(cmd);
    select({ kind: 'room', id: roomId });
  };
  const styles = ['All', ...new Set((templates.data ?? []).map((t) => t.style).filter(Boolean))];
  return (
    <div className="section">
      {styles.length > 2 && (
        <div className="chips">
          {styles.map((s) => (
            <button key={s} className={`chip ${style === s ? 'on' : ''}`} onClick={() => setStyle(s)}>{s}</button>
          ))}
        </div>
      )}
      {target ? <div className="field-hint">Applies to {target.info.name}. Select a room in the plan to choose another.</div> : <div className="field-hint">Draw a room first.</div>}
      {templates.isLoading && <div className="field-hint">Loading…</div>}
      {templates.error && <div className="field-hint" style={{ color: 'var(--error)' }}>{errorMessage(templates.error)}</div>}
      {templates.data && list.length === 0 && <div className="field-hint">No templates yet. Select a furnished room and use “Save room as template” in its properties.</div>}
      <ul className="tpl-list">
        {list.map((t) => (
          <li key={t.id} className="tpl-card">
            <TemplatePreview t={t.template} />
            <div className="tpl-meta">
              <strong>{t.name}</strong>
              <span>{[t.style, t.roomType].filter(Boolean).join(' · ')} · {t.pieceCount} pieces</span>
              <span className="num">{(t.template.widthUm / 1000).toFixed(0)} × {(t.template.depthUm / 1000).toFixed(0)} mm room</span>
            </div>
            <div className="btn-row">
              <button className="btn" disabled={readOnly || !target} onClick={() => apply(t, 'add')} title="Add the pieces and finishes, keep what's there">Add</button>
              <button className="btn primary" disabled={readOnly || !target} onClick={() => apply(t, 'replace')} title="Remove this room's furniture first">Replace room</button>
              {canAdmin && <button className="btn danger" onClick={() => confirm(`Delete template “${t.name}” for everyone in the studio?`) && del.mutate(t.id)} aria-label={`Delete ${t.name}`}>Delete</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
