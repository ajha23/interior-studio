import { Plus } from 'lucide-react';
import { APPLIANCE_SPECS, CABINET_SPECS, type ApplianceType, type CabinetType, type DesignCommand } from '@/domain';
import { PanelSection } from '@/components/layout/PanelSection';
import { useEditorStore } from '@/state/editorStore';

type Entry = { key: string; label: string; detail: string; command: DesignCommand };

function cabinet(type: CabinetType, width?: number): Entry {
  const spec = CABINET_SPECS[type];
  const dims = { ...spec.defaults, width: width ?? spec.defaults.width };
  return {
    key: `${type}-${dims.width}`,
    label: spec.label,
    detail: `${dims.width} × ${dims.height} × ${dims.depth}`,
    command: { type: 'add_cabinet', cabinetType: type, dimensions: dims },
  };
}

function appliance(type: ApplianceType): Entry {
  const spec = APPLIANCE_SPECS[type];
  const d = spec.defaults;
  return { key: type, label: spec.label, detail: `${d.width} × ${d.height} × ${d.depth}`, command: { type: 'add_appliance', applianceType: type } };
}

const GROUPS: { title: string; entries: Entry[] }[] = [
  { title: 'Base units', entries: [cabinet('base'), cabinet('base', 400), cabinet('drawer'), cabinet('sink'), cabinet('corner')] },
  { title: 'Wall units', entries: [cabinet('wall'), cabinet('wall', 800), cabinet('wall', 400)] },
  { title: 'Tall units', entries: [cabinet('tall')] },
  { title: 'Appliances', entries: [appliance('fridge'), appliance('range'), appliance('dishwasher'), appliance('hood')] },
];

/** Design library: each entry adds a real element in the first free spot on a wall. */
export function CatalogPanel() {
  const dispatch = useEditorStore((s) => s.dispatch);
  return (
    <div aria-label="Design library">
      {GROUPS.map((g) => (
        <PanelSection key={g.title} title={g.title}>
          <ul className="flex flex-col gap-0.5">
            {g.entries.map((e) => (
              <li key={e.key}>
                <button
                  type="button"
                  onClick={() => dispatch(e.command)}
                  className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  aria-label={`Add ${e.label} ${e.detail}`}
                >
                  <span className="flex-1 truncate">{e.label}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{e.detail}</span>
                  <Plus className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </button>
              </li>
            ))}
          </ul>
        </PanelSection>
      ))}
    </div>
  );
}
