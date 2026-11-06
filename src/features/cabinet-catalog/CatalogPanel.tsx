import { useMemo, useState } from 'react';
import { Layers, Package, Plus, Search, Sparkles } from 'lucide-react';
import {
  APPLIANCE_SPECS,
  CABINET_SPECS,
  FURNITURE_SPECS,
  OPENING_SPECS,
  PRODUCT_CATALOG,
  createRealisticShowcaseProject,
  type ApplianceType,
  type CabinetType,
  type CatalogItem,
  type DesignCommand,
  type FurnitureType,
  type OpeningKind,
} from '@/domain';
import { PanelSection } from '@/components/layout/PanelSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDimsIn } from '@/engine/measurement/units';
import { useEditorStore } from '@/state/editorStore';
import { useFormatLength, useLengthUnit } from '@/state/units';

type Entry = {
  key: string;
  label: string;
  dims: { width: number; height: number; depth?: number };
  command: DesignCommand;
  vendor?: string;
  categoryBadge?: string;
  mountingHint?: string;
  postAdd?: (cabinetId: string, dispatch: (cmd: DesignCommand) => void) => void;
};

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
  return {
    key: `furniture-${type}`,
    label: spec.label,
    dims: spec.defaults,
    command: { type: 'add_furniture', furnitureType: type },
  };
}

function opening(kind: OpeningKind): Entry {
  const spec = OPENING_SPECS[kind];
  return {
    key: `opening-${kind}`,
    label: kind === 'opening' ? 'Wide opening' : spec.label,
    dims: { width: spec.width.default, height: spec.height.default },
    command: { type: 'add_opening', kind },
  };
}

function appliance(type: ApplianceType): Entry {
  const spec = APPLIANCE_SPECS[type];
  const d = spec.defaults;
  return {
    key: type,
    label: spec.label,
    dims: d,
    command: { type: 'add_appliance', applianceType: type },
  };
}

function catalogItemToEntry(item: CatalogItem): Entry {
  const w = item.target_cabinet_width_mm ?? item.dimensions_mm.width;
  let command: DesignCommand;

  if (item.target_cabinet_type) {
    const spec = CABINET_SPECS[item.target_cabinet_type];
    const dims = { ...spec.defaults, width: w };
    command = { type: 'add_cabinet', cabinetType: item.target_cabinet_type, dimensions: dims };
  } else if (item.placement.type === 'floor') {
    command = { type: 'add_furniture', furnitureType: 'chair' };
  } else {
    const spec = CABINET_SPECS.base;
    const dims = { ...spec.defaults, width: Math.min(1200, Math.max(300, w)) };
    command = { type: 'add_cabinet', cabinetType: 'base', dimensions: dims };
  }

  let postAdd: Entry['postAdd'];
  const sub = item.category.sub;

  if (sub.includes('Waste Systems') || sub.includes('Recycling')) {
    const h = Math.min(450, Math.max(250, item.dimensions_mm.height));
    postAdd = (cabId, d) => {
      d({
        type: 'set_interior',
        cabinetId: cabId,
        interior: { sections: [{ width: null, fittings: [{ kind: 'basket', y: 40, height: h }] }] },
      });
    };
  } else if (sub.includes('Flap & Lifter')) {
    postAdd = (cabId, d) => {
      d({ type: 'set_front_style', cabinetId: cabId, style: 'glass' });
      d({
        type: 'set_interior',
        cabinetId: cabId,
        interior: { sections: [{ width: null, fittings: [{ kind: 'shelf', y: 320, glass: true }] }] },
      });
    };
  } else if (sub.includes('Pantry')) {
    postAdd = (cabId, d) => {
      d({ type: 'apply_interior_preset', cabinetId: cabId, preset: 'pantry' });
    };
  } else if (sub.includes('Drawer') || sub.includes('Inserts') || item.item_name.includes('Canister')) {
    postAdd = (cabId, d) => {
      d({ type: 'apply_interior_preset', cabinetId: cabId, preset: 'drawers' });
    };
  }

  return {
    key: `product-${item.asset_id}`,
    label: item.item_name,
    dims: {
      width: item.dimensions_mm.width,
      depth: item.dimensions_mm.depth,
      height: item.dimensions_mm.height,
    },
    command,
    vendor: item.vendor,
    categoryBadge: item.category.sub,
    mountingHint: item.target_cabinet_width_mm
      ? `Fits ${item.target_cabinet_width_mm}mm cabinet`
      : item.placement.type.replace('_', ' '),
    postAdd,
  };
}

const MODULE_GROUPS: { title: string; entries: Entry[] }[] = [
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

/** Product catalog items organized by subcategory */
function buildProductCatalogGroups(): { title: string; entries: Entry[] }[] {
  const groupsMap = new Map<string, Entry[]>();
  for (const item of PRODUCT_CATALOG) {
    const sub = item.category.sub;
    const entry = catalogItemToEntry(item);
    if (!groupsMap.has(sub)) {
      groupsMap.set(sub, []);
    }
    groupsMap.get(sub)!.push(entry);
  }

  const order = [
    'Cabinet Waste Systems',
    'Drawer Inserts & Organizers',
    'Cabinet Drawers & Pull-Outs',
    'Internal Cabinet Drawers',
    'Cabinet Flap & Lifter Hardware',
    'Pantry & Dry Food Storage',
    'Pantry & Tall Storage Units',
    'Electronic Cabinet Hardware',
    'Kitchen Stools & Ladders',
    'Closet & Wardrobe Accessories',
  ];

  return order
    .filter((title) => groupsMap.has(title))
    .map((title) => ({
      title,
      entries: groupsMap.get(title)!,
    }));
}

const PRODUCT_GROUPS = buildProductCatalogGroups();

/** Design library: each entry adds a real element (or wall opening) in the first free spot on a wall. */
export function CatalogPanel() {
  const dispatch = useEditorStore((s) => s.dispatch);
  const openProject = useEditorStore((s) => s.openProject);
  const fmt = useFormatLength();
  const unit = useLengthUnit();
  const [filter, setFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'modules' | 'fittings'>('all');

  const detail = (d: Entry['dims']) =>
    d.depth === undefined ? `${fmt(d.width)} × ${fmt(d.height)}` : formatDimsIn({ ...d, depth: d.depth }, unit);

  const displayedGroups = useMemo(() => {
    const sourceGroups: { title: string; entries: Entry[] }[] =
      activeTab === 'modules'
        ? MODULE_GROUPS
        : activeTab === 'fittings'
          ? PRODUCT_GROUPS
          : [...MODULE_GROUPS, ...PRODUCT_GROUPS];

    if (!filter.trim()) return sourceGroups;

    const q = filter.trim().toLowerCase();
    return sourceGroups
      .map((g) => ({
        title: g.title,
        entries: g.entries.filter(
          (e) =>
            e.label.toLowerCase().includes(q) ||
            e.vendor?.toLowerCase().includes(q) ||
            e.categoryBadge?.toLowerCase().includes(q) ||
            g.title.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.entries.length > 0);
  }, [activeTab, filter]);

  const handleAdd = (entry: Entry) => {
    const res = dispatch(entry.command);
    const cabId = res.affectedEntityIds[0];
    if (cabId && entry.postAdd) {
      entry.postAdd(cabId, dispatch);
    }
  };

  return (
    <div aria-label="Design library" className="flex flex-col gap-2 p-1">
      {/* Showcase Callout Banner */}
      <div className="mx-2 mt-1 rounded-md border border-primary/25 bg-primary/5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" />
            <span>Realistic Showcase</span>
          </div>
          <Button
            size="xs"
            variant="outline"
            className="h-6 px-2 text-[11px] font-medium"
            onClick={() => openProject(createRealisticShowcaseProject())}
          >
            Load Scene
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
          Full room layout loaded with realistic Hailo &amp; Kesseböhmer modules.
        </p>
      </div>

      {/* Search Input */}
      <div className="relative px-2 pt-0.5">
        <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search library & catalog..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Filter catalog"
        />
      </div>

      {/* Catalog Category Filter Tabs */}
      <div className="flex gap-1 px-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 transition-colors ${
            activeTab === 'all' ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted/60 text-muted-foreground hover:bg-muted'
          }`}
          aria-pressed={activeTab === 'all'}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('modules')}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 transition-colors ${
            activeTab === 'modules' ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted/60 text-muted-foreground hover:bg-muted'
          }`}
          aria-pressed={activeTab === 'modules'}
        >
          <Layers className="size-3" /> Modules
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('fittings')}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 transition-colors ${
            activeTab === 'fittings' ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted/60 text-muted-foreground hover:bg-muted'
          }`}
          aria-pressed={activeTab === 'fittings'}
        >
          <Package className="size-3" /> Fittings
        </button>
      </div>

      {/* Group Sections */}
      <div className="flex flex-col">
        {displayedGroups.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No library items match &ldquo;{filter}&rdquo;
          </div>
        ) : (
          displayedGroups.map((g) => (
            <PanelSection key={g.title} title={g.title}>
              <ul className="flex flex-col gap-0.5">
                {g.entries.map((e) => (
                  <li key={e.key}>
                    <button
                      type="button"
                      onClick={() => handleAdd(e)}
                      className="group flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      aria-label={`Add ${e.label} ${detail(e.dims)}`}
                    >
                      <div className="flex w-full items-baseline justify-between gap-x-2">
                        <span className="font-medium text-xs leading-snug">{e.label}</span>
                        <Plus className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        {e.vendor && (
                          <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal leading-tight">
                            {e.vendor}
                          </Badge>
                        )}
                        <span className="tabular-nums font-mono">{detail(e.dims)}</span>
                        {e.mountingHint && (
                          <span className="text-muted-foreground/80">· {e.mountingHint}</span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </PanelSection>
          ))
        )}
      </div>
    </div>
  );
}
