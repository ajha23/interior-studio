import { ChevronRight, CircleHelp } from 'lucide-react';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { saveCurrentProject } from '@/features/projects/projectActions';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/state/editorStore';
import { COMMAND_HELP, parseCommandLine, type CommandLineAction } from './parseCommandLine';

interface LogLine {
  id: number;
  text: string;
  tone: 'ok' | 'error' | 'echo';
}

export interface CommandLineHandle {
  focus: (initial?: string) => void;
}

/** Runs one parsed action against the editor and returns what to print. */
async function run(action: CommandLineAction): Promise<{ ok: boolean; message: string } | 'help'> {
  const s = useEditorStore.getState();
  switch (action.kind) {
    case 'help':
      return 'help';
    case 'error':
      return { ok: false, message: action.message };
    case 'design': {
      const r = s.dispatch(action.command);
      return r.success ? { ok: true, message: r.summary } : { ok: false, message: r.errors.join(' ') };
    }
    case 'history':
      if (action.action === 'undo' ? !s.past.length : !s.future.length) return { ok: false, message: `Nothing to ${action.action}.` };
      if (action.action === 'undo') s.undo();
      else s.redo();
      return { ok: true, message: useEditorStore.getState().feedback?.messages[0] ?? action.action };
    case 'select':
      s.select(action.id);
      return { ok: true, message: action.id ? 'Selected.' : 'Selection cleared.' };
    case 'interact':
      s.setInteractMode(!s.interactMode);
      return { ok: true, message: useEditorStore.getState().interactMode ? 'Interact mode: click doors and drawers to open them.' : 'Edit mode.' };
    case 'open':
      s.setAllOpen(action.all ? null : s.selectedId, action.open);
      return { ok: true, message: `${action.open ? 'Opened' : 'Closed'} ${action.all ? 'every door and drawer' : 'the doors and drawers of the selected unit'}.` };
    case 'walk':
      s.setNavMode(action.on ? 'walk' : 'orbit');
      return { ok: true, message: action.on ? 'Walking: W A S D to move, drag to look, click the floor to go there.' : 'Orbit view.' };
    case 'stand':
      if (s.navMode !== 'walk') s.setNavMode('walk');
      useEditorStore.getState().focusSelection();
      return { ok: true, message: 'Standing at the selected unit.' };
    case 'eye':
      s.setEyeHeight(action.mm);
      return { ok: true, message: `Eye height ${action.mm} mm.` };
    case 'cycle':
      s.cycleSelection(action.direction);
      return { ok: true, message: 'Selected the next unit.' };
    case 'save':
      return (await saveCurrentProject()) ? { ok: true, message: 'Saved.' } : { ok: false, message: 'Could not save.' };
    case 'view': {
      const a = action.action;
      if (a.kind === 'fit') s.requestCamera({ kind: 'fit' });
      else if (a.kind === 'focus') s.focusSelection();
      else if (a.kind === 'preset') {
        s.setView('3d');
        s.requestCamera({ kind: 'preset', preset: a.preset });
      } else if (a.kind === 'style') s.setVisualStyle(a.style);
      else if (a.kind === 'projection') s.setProjection(a.projection);
      else if (a.kind === 'mode') s.setView(a.mode);
      else if (a.what === 'grid') s.toggleGrid();
      else if (a.what === 'walls') s.toggleAutoHideWalls();
      else if (a.what === 'inside') s.setShowInteriors(!s.showInteriors);
      else s.toggleBom();
      return { ok: true, message: 'View updated.' };
    }
  }
}

/**
 * AutoCAD-style command line under the viewport. `/` focuses it from anywhere; ↑/↓ walk the
 * history; Enter on an empty line repeats the last command.
 */
export function CommandLine({ ref }: { ref?: Ref<CommandLineHandle> }) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [log, setLog] = useState<LogLine[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const seq = useRef(0);

  useImperativeHandle(ref, () => ({
    focus: (initial = '') => {
      setText(initial);
      input.current?.focus();
    },
  }));

  const print = (line: string, tone: LogLine['tone']) => setLog((l) => [...l.slice(-2), { id: ++seq.current, text: line, tone }]);

  const submit = async () => {
    const line = text.trim() || history.at(-1) || '';
    setText('');
    setCursor(null);
    if (!line) return;
    if (text.trim()) setHistory((h) => [...h.filter((x) => x !== line), line].slice(-50));
    print(`Command: ${line}`, 'echo');
    const s = useEditorStore.getState();
    if (!s.project) return;
    const result = await run(parseCommandLine(line, { project: s.project, selectedId: s.selectedId }));
    if (result === 'help') {
      setShowHelp(true);
      return;
    }
    print(result.message, result.ok ? 'ok' : 'error');
  };

  return (
    <div className="relative border-t bg-card" data-testid="command-line">
      {showHelp && (
        <div className="absolute right-3 bottom-full left-3 mb-2 max-h-72 overflow-auto rounded-lg border bg-card p-3 text-xs shadow-lg" role="dialog" aria-label="Commands">
          <div className="mb-2 flex items-center justify-between">
            <strong>Commands</strong>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setShowHelp(false)}>Close</button>
          </div>
          <table className="w-full">
            <tbody>
              {COMMAND_HELP.map((h) => (
                <tr key={h.usage} className="border-t">
                  <td className="py-1 pr-3 font-mono whitespace-nowrap">{h.usage}</td>
                  <td className="py-1 text-muted-foreground">{h.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="px-3 pt-1 font-mono text-[11px] leading-4" aria-live="polite" data-testid="command-log">
        {log.map((l) => (
          <li key={l.id} className={cn(l.tone === 'error' ? 'text-destructive' : l.tone === 'echo' ? 'text-muted-foreground' : 'text-foreground')}>
            {l.text}
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-1.5 px-2 pb-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
        <label htmlFor="command-input" className="font-mono text-xs text-muted-foreground">Command:</label>
        <input
          id="command-input"
          ref={input}
          value={text}
          autoComplete="off"
          spellCheck={false}
          placeholder="w 900 · m 1200 · e · ze · f · help   (press / to type)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setText('');
              setShowHelp(false);
              e.currentTarget.blur();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              if (!history.length) return;
              const next = cursor === null ? (e.key === 'ArrowUp' ? history.length - 1 : null) : cursor + (e.key === 'ArrowUp' ? -1 : 1);
              const clamped = next === null || next >= history.length ? null : Math.max(0, next);
              setCursor(clamped);
              setText(clamped === null ? '' : history[clamped]!);
            }
          }}
          className="h-7 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-muted-foreground/70"
        />
        <button type="button" onClick={() => setShowHelp((v) => !v)} className="text-muted-foreground hover:text-foreground" aria-label="Command help" title="Command help">
          <CircleHelp className="size-4" />
        </button>
      </form>
    </div>
  );
}
