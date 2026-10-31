import { Bookmark, ChevronDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEditorStore } from '@/state/editorStore';

/** Saved places to stand and look from. Saving needs walk mode; jumping to one starts walking. */
export function ViewpointsMenu() {
  const viewpoints = useEditorStore((s) => s.project?.viewpoints ?? []);
  const walking = useEditorStore((s) => s.navMode === 'walk');
  const pose = useEditorStore((s) => s.walkPose);
  const eye = useEditorStore((s) => s.eyeHeight);
  const { dispatch, requestWalk, setEyeHeight } = useEditorStore.getState();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const save = () => {
    if (!pose || !name.trim()) return;
    const r = dispatch({ type: 'save_viewpoint', viewpoint: { name: name.trim(), x: Math.round(pose.x), z: Math.round(pose.z), yaw: pose.yaw, pitch: pose.pitch, eye } });
    if (r.success) setName('');
  };

  return (
    <div className="relative">
      <Button size="xs" variant={open ? 'selected' : 'ghost'} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Viewpoints" title="Saved viewpoints: places to stand and look from">
        <Bookmark /> Views <ChevronDown />
      </Button>
      {open && (
        <div className="absolute top-full left-0 z-10 mt-1 flex w-64 flex-col gap-2 rounded-lg border bg-card p-2 shadow-lg" role="dialog" aria-label="Saved viewpoints">
          {viewpoints.length === 0 && <p className="text-xs text-muted-foreground">No saved viewpoints yet.</p>}
          <ul className="flex flex-col gap-0.5">
            {viewpoints.map((v) => (
              <li key={v.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex-1 truncate rounded px-2 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setEyeHeight(v.eye);
                    requestWalk({ kind: 'pose', pose: { x: v.x, z: v.z, yaw: v.yaw, pitch: v.pitch } });
                    setOpen(false);
                  }}
                >
                  {v.name} <span className="text-[11px] text-muted-foreground">· eye {v.eye}</span>
                </button>
                <button type="button" className="p-1 text-muted-foreground hover:text-destructive" aria-label={`Delete ${v.name}`} onClick={() => dispatch({ type: 'delete_viewpoint', id: v.id })}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          {walking ? (
            <form
              className="flex gap-1 border-t pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Input aria-label="Viewpoint name" placeholder="e.g. At the hob" value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs" />
              <Button type="submit" size="xs" disabled={!name.trim() || !pose}>Save here</Button>
            </form>
          ) : (
            <p className="border-t pt-2 text-[11px] text-muted-foreground">Start Walk to save where you are standing.</p>
          )}
        </div>
      )}
    </div>
  );
}
