import { useMemo, useRef, useState, useEffect } from 'react';
import {
  Box,
  Columns2,
  Download,
  FileText,
  Map as MapIcon,
  PlusCircle,
  Redo2,
  Ruler,
  Save,
  Search,
  ShieldCheck,
  Table2,
  Undo2,
} from 'lucide-react';
import { useEditorStore } from '@/state/editorStore';
import { useSiteCaptureStore } from '@/state/siteCaptureStore';
import { exportProject, saveCurrentProject } from '@/features/projects/projectActions';
import { useCommandPaletteStore } from './commandPaletteStore';

export interface CommandItem {
  id: string;
  category: 'View' | 'Insert' | 'Project' | 'Panels';
  label: string;
  description?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  keywords?: string[];
  run: () => void | Promise<void>;
}

function CommandPaletteDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const { project, setView, toggleBom, toggleChecks, undo, redo, dispatch } = useEditorStore();
  const openSiteCapture = useSiteCaptureStore((s) => s.openModal);

  const commands = useMemo<CommandItem[]>(() => {
    return [
      // View Modes
      {
        id: 'view-3d',
        category: 'View',
        label: 'Switch to 3D View',
        description: 'Interactive 3D walkthrough and orbit viewport',
        shortcut: '1',
        icon: <Box className="size-4" />,
        run: () => setView('3d'),
      },
      {
        id: 'view-plan',
        category: 'View',
        label: 'Switch to Floor Plan View',
        description: '2D architectural floor plan with dimensions and snapping',
        shortcut: '2',
        icon: <MapIcon className="size-4" />,
        run: () => setView('plan'),
      },
      {
        id: 'view-split',
        category: 'View',
        label: 'Switch to Split View',
        description: 'Side-by-side 2D Plan and 3D Viewport',
        shortcut: '3',
        icon: <Columns2 className="size-4" />,
        run: () => setView('split'),
      },
      {
        id: 'view-drawings',
        category: 'View',
        label: 'Switch to Deliverables & Drawings',
        description: 'Production drawings, elevation sheets, and client quotations',
        shortcut: '4',
        icon: <FileText className="size-4" />,
        run: () => setView('drawings'),
      },

      // Insert Cabinets & Elements
      {
        id: 'insert-base-cabinet',
        category: 'Insert',
        label: 'Insert Base Cabinet',
        description: 'Standard 600mm floor-standing base kitchen unit',
        shortcut: 'B',
        icon: <PlusCircle className="size-4" />,
        keywords: ['cabinet', 'base', 'unit', 'cupboard'],
        run: () => {
          dispatch({ type: 'add_cabinet', cabinetType: 'base' });
        },
      },
      {
        id: 'insert-wall-cabinet',
        category: 'Insert',
        label: 'Insert Wall Cabinet',
        description: 'Standard 600mm wall-hung upper kitchen unit',
        shortcut: 'W',
        icon: <PlusCircle className="size-4" />,
        keywords: ['cabinet', 'wall', 'upper', 'overhead'],
        run: () => {
          dispatch({ type: 'add_cabinet', cabinetType: 'wall' });
        },
      },
      {
        id: 'insert-tall-cabinet',
        category: 'Insert',
        label: 'Insert Tall Cabinet',
        description: 'Full-height pantry or appliance tall tower unit',
        shortcut: 'T',
        icon: <PlusCircle className="size-4" />,
        keywords: ['cabinet', 'tall', 'pantry', 'tower'],
        run: () => {
          dispatch({ type: 'add_cabinet', cabinetType: 'tall' });
        },
      },
      {
        id: 'insert-sink',
        category: 'Insert',
        label: 'Insert Sink Unit',
        description: 'Base sink cabinet unit with water drainage cutouts',
        shortcut: 'S',
        icon: <PlusCircle className="size-4" />,
        keywords: ['sink', 'water', 'basin'],
        run: () => {
          dispatch({ type: 'add_cabinet', cabinetType: 'sink' });
        },
      },
      {
        id: 'insert-fridge',
        category: 'Insert',
        label: 'Insert Refrigerator',
        description: 'Standard upright kitchen refrigerator appliance',
        icon: <PlusCircle className="size-4" />,
        keywords: ['appliance', 'fridge', 'refrigerator'],
        run: () => {
          dispatch({ type: 'add_appliance', applianceType: 'fridge' });
        },
      },
      {
        id: 'insert-range',
        category: 'Insert',
        label: 'Insert Hob / Range',
        description: 'Cooking hob / range appliance',
        icon: <PlusCircle className="size-4" />,
        keywords: ['appliance', 'range', 'hob', 'cooktop', 'stove'],
        run: () => {
          dispatch({ type: 'add_appliance', applianceType: 'range' });
        },
      },

      // Project Actions
      {
        id: 'project-save',
        category: 'Project',
        label: 'Save Project',
        description: 'Persist project changes to local browser storage',
        shortcut: '⌘S',
        icon: <Save className="size-4" />,
        keywords: ['save', 'persist', 'store'],
        run: async () => {
          await saveCurrentProject();
        },
      },
      {
        id: 'project-export',
        category: 'Project',
        label: 'Export Project File',
        description: 'Download full project JSON envelope (.kitchen.json)',
        icon: <Download className="size-4" />,
        keywords: ['export', 'download', 'json'],
        run: () => {
          if (project) exportProject(project);
        },
      },
      {
        id: 'project-undo',
        category: 'Project',
        label: 'Undo Last Action',
        description: 'Revert recent change in history',
        shortcut: '⌘Z',
        icon: <Undo2 className="size-4" />,
        keywords: ['undo', 'revert'],
        run: () => undo(),
      },
      {
        id: 'project-redo',
        category: 'Project',
        label: 'Redo Action',
        description: 'Re-apply previously undone change',
        shortcut: '⇧⌘Z',
        icon: <Redo2 className="size-4" />,
        keywords: ['redo'],
        run: () => redo(),
      },

      // Panels & Tools
      {
        id: 'toggle-bom',
        category: 'Panels',
        label: 'Toggle Bill of Materials (BOM)',
        description: 'Open or close the cost estimate and parts breakdown table',
        icon: <Table2 className="size-4" />,
        keywords: ['bom', 'bill of materials', 'cost', 'pricing', 'quote'],
        run: () => toggleBom(),
      },
      {
        id: 'toggle-checks',
        category: 'Panels',
        label: 'Toggle Design Checks Panel',
        description: 'Inspect design clearances, ergonomic rules, and warnings',
        icon: <ShieldCheck className="size-4" />,
        keywords: ['checks', 'warnings', 'ergonomics', 'errors'],
        run: () => toggleChecks(),
      },
      {
        id: 'open-site-capture',
        category: 'Panels',
        label: 'Open Site Measurement & Capture',
        description: 'Wall measurements, diagonal check, and photo uploads',
        icon: <Ruler className="size-4" />,
        keywords: ['site', 'measurement', 'capture', 'diagonal', 'photos'],
        run: () => openSiteCapture(),
      },
    ];
  }, [project, setView, toggleBom, toggleChecks, undo, redo, dispatch, openSiteCapture]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().trim();
    return commands.filter((cmd) => {
      const matchLabel = cmd.label.toLowerCase().includes(q);
      const matchDesc = cmd.description?.toLowerCase().includes(q);
      const matchCategory = cmd.category.toLowerCase().includes(q);
      const matchKeywords = cmd.keywords?.some((k) => k.toLowerCase().includes(q));
      return matchLabel || matchDesc || matchCategory || matchKeywords;
    });
  }, [commands, query]);

  const activeIndex = Math.min(selectedIndex, Math.max(0, filteredCommands.length - 1));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredCommands.length > 0 ? (prev + 1) % filteredCommands.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredCommands.length > 0 ? (prev - 1 + filteredCommands.length) % filteredCommands.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredCommands[activeIndex];
      if (selected) {
        selected.run();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="command-palette-backdrop"
    >
      <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-100">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            type="text"
            className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
            placeholder="Type a command or search... (Cmd+K)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            data-testid="command-palette-input"
            aria-label="Search commands"
          />
          <kbd className="hidden select-none rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="max-h-80 overflow-y-auto p-2"
          data-testid="command-palette-list"
        >
          {filteredCommands.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No matching commands found.
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={cmd.id}
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`command-item-${cmd.id}`}
                  onClick={() => {
                    cmd.run();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'text-card-foreground hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <span className={isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}>
                      {cmd.icon}
                    </span>
                    <div className="truncate">
                      <div className="font-medium truncate">{cmd.label}</div>
                      {cmd.description && (
                        <div
                          className={`truncate text-xs ${
                            isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                          }`}
                        >
                          {cmd.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {cmd.shortcut && (
                    <kbd
                      className={`ml-2 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        isSelected
                          ? 'border-primary-foreground/30 bg-primary-foreground/20 text-primary-foreground'
                          : 'border-border bg-muted text-muted-foreground'
                      }`}
                    >
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hint */}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>Unified Studio</span>
        </div>
      </div>
    </div>
  );
}

export function CommandPalette() {
  const { isOpen, close, toggle } = useCommandPaletteStore();

  // Global Cmd+K / Ctrl+K and Escape listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle, close, isOpen]);

  if (!isOpen) return null;

  return <CommandPaletteDialog onClose={close} />;
}
