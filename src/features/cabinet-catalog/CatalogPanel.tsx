import { Plus } from 'lucide-react';
import { APPLIANCE_SPECS, CABINET_SPECS, FURNITURE_SPECS, OPENING_SPECS, type ApplianceType, type CabinetType, type DesignCommand, type FurnitureType, type OpeningKind } from '@/domain';
import { PanelSection } from '@/components/layout/PanelSection';
import { formatDimsIn } from '@/engine/measurement/units';
import { useEditorStore } from '@/state/editorStore';
import { useFormatLength, useLengthUnit } from '@/state/units';

type Entry = { key: string; label: string; dims: { width: number; height: number; depth?: number }; command: DesignCommand };

function cabinet(type: CabinetType, width?: number): Entry {
  const spec = CABINET_SPECS[type];
  const dims = { ...spec.defaults, width: width ?? spec.defaults.width };
  return {
    key: `${type}-${dims.width}`,
    label: spec.label,
    dims,
    command: { type: 'add_cabinet', cabinetType: type, dimensions: dims },
  };
}

function furniture(type: FurnitureType): Entry {
  const spec = FURNITURE_SPECS[type];
  return { key: `furniture-${type}`, label: spec.label, dims: spec.defaults, command: { type: 'add_furniture', furnitureType: type } };
}

function opening(kind: OpeningKind): Entry {
  const spec = OPENING_SPECS[kind];
  return { key: `opening-${kind}`, label: kind === 'opening' ? 'Wide opening' : spec.label, dims: { width: spec.width.default, height: spec.height.default }, command: { type: 'add_opening', kind } };
}

function appliance(type: ApplianceType): Entry {
  const spec = APPLIANCE_SPECS[type];
  const d = spec.defaults;
  return { key: type, label: spec.label, dims: d, command: { type: 'add_appliance', applianceType: type } };
}

const GROUPS: { title: string; entries: Entry[] }[] = [
  { title: 'Base units', entries: [cabinet('base'), cabinet('base', 400), cabinet('drawer'), cabinet('sink'), cabinet('corner')] },
  { title: 'Wall units', entries: [cabinet('wall'), cabinet('wall', 800), cabinet('wall', 400)] },
  { title: 'Tall units', entries: [cabinet('tall')] },
  { title: 'Appliances', entries: [appliance('fridge'), appliance('range'), appliance('dishwasher'), appliance('hood')] },
  { title: 'Doors & windows', entries: [opening('door'), opening('window'), opening('opening')] },
  { title: 'Furniture', entries: [furniture('table'), furniture('chair'), furniture('sofa')] },
  { title: 'Living', entries: [furniture('armchair'), furniture('coffee-table'), furniture('tv-unit'), furniture('bookshelf')] },
  { title: 'Bedroom', entries: [furniture('bed'), furniture('wardrobe'), furniture('nightstand'), furniture('dresser'), furniture('desk')] },
  { title: 'Bathroom', entries: [furniture('toilet'), furniture('basin'), furniture('shower'), furniture('bathtub')] },
  { title: 'Structure', entries: [furniture('stairs')] },
];

/** Design library: each entry adds a real element (or wall opening) in the first free spot on a wall. */
export function CatalogPanel() {
  const dispatch = useEditorStore((s) => s.dispatch);
  const fmt = useFormatLength();
  const unit = useLengthUnit();
  const detail = (d: Entry['dims']) => (d.depth === undefined ? `${fmt(d.width)} × ${fmt(d.height)}` : formatDimsIn({ ...d, depth: d.depth }, unit));
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
                  aria-label={`Add ${e.label} ${detail(e.dims)}`}
                >
                  <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2">
                    <span>{e.label}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{detail(e.dims)}</span>
                  </span>
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
