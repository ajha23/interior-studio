/**
 * Deliverables: configuration, approved revisions and generation history. Files are made by the
 * framework-free engine (engine/deliverables) from one exact revision — the current design or an
 * approved snapshot — and every record keeps that revision, so an output generated before a change
 * shows as stale and can be regenerated.
 *
 * Approvals and history are kept in this browser (localStorage, per project), like the projects
 * themselves; the files are downloaded, not stored.
 */
import { useVisionStore } from './visionStore';
import { create } from 'zustand';
import { parseProjectFile, serializeProject, type KitchenProject, type WallId } from '@/domain';
import { buildBom } from '@/engine/deliverables/bom';
import type { Paper, ScaleChoice } from '@/engine/deliverables/drawing';
import { pdfBytes, sheetsToPdf } from '@/engine/deliverables/pdf';
import { checkReadiness, type Readiness } from '@/engine/deliverables/readiness';
import { designRevision, shortRevision } from '@/engine/deliverables/revision';
import { bomCsv, buildDrawingSet, DEFAULT_CONFIG, elevationWalls, scheduleCsv, type DeliverableConfig, type DrawingSet } from '@/engine/deliverables/set';
import { sheetToSvg } from '@/engine/deliverables/svg';
import { cutList, cutListCsv } from '@/engine/production/cutlist';
import { constructionOf } from '@/engine/deliverables/construction';
import { SEED_RULE_PACK_V1 } from '@/domain/manufacturing/rulePack';
import { explodeScene } from '@/engine/manufacturing/explode';
import { exportOptiCutCsv } from '@/engine/manufacturing/opticutCsv';
import { calculateQuotation, type QuotationLineItem } from '@/engine/commercial/gst';
import { exportPlanDxf } from '@/engine/deliverables/dxf';
import type { LengthUnit } from '@/engine/measurement/units';
import { useEditorStore } from './editorStore';

export type DeliverableKind = 'pdf-set' | 'pdf-sheet' | 'svg-sheet' | 'schedule-csv' | 'bom-csv' | 'cutlist-csv' | 'opticut-csv' | 'quotation-csv' | 'dxf-plan';

export const KIND_LABEL: Record<DeliverableKind, string> = {
  'pdf-set': 'Drawing set (PDF)',
  'pdf-sheet': 'Sheet (PDF)',
  'svg-sheet': 'Sheet (SVG)',
  'schedule-csv': 'Cabinet schedule (CSV)',
  'bom-csv': 'Bill of materials (CSV)',
  'cutlist-csv': 'Cut list (CSV)',
  'opticut-csv': 'OptiCut 16-col (CSV)',
  'quotation-csv': 'Quotation & GST (CSV)',
  'dxf-plan': 'CAD Floor Plan (DXF)',
};

export interface Approval {
  revision: string;
  approvedAt: string;
  file: string;
}

export interface DeliverableRecord {
  id: string;
  kind: DeliverableKind;
  projectId: string;
  revision: string;
  /** Generated from the current design or an approved revision. */
  source: 'current' | 'approved';
  sheetId?: string;
  createdAt: string;
  fileName: string;
  unit: LengthUnit;
  config: DeliverableConfig;
  readiness: Readiness['outputs'];
  warnings: string[];
}

export interface GeneratedFile {
  fileName: string;
  mime: string;
  data: string | Uint8Array;
  record: DeliverableRecord;
}

type Source = { kind: 'current' } | { kind: 'approved'; revision: string };

interface DeliverablesState {
  config: DeliverableConfig | null;
  source: Source;
  approvals: Approval[];
  history: DeliverableRecord[];
  /** Selected section in the Deliverables view. */
  section: string;
  setSection: (section: string) => void;
  setConfig: (patch: Partial<DeliverableConfig>) => void;
  setSource: (source: Source) => void;
  approveCurrent: () => Approval | null;
  generate: (kind: DeliverableKind, sheetId?: string) => GeneratedFile | null;
  regenerate: (recordId: string) => GeneratedFile | null;
  load: (projectId: string | null) => void;
}

const KEY = (projectId: string, what: 'approvals' | 'history') => `interior-studio:deliverables:${projectId}:${what}`;
const CONFIG_KEY = 'interior-studio:deliverables:config';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: history is a convenience, files are already downloaded.
  }
}

const slug = (s: string) => s.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'kitchen';

/** The project a deliverable is made from. */
export function sourceProject(source: Source, approvals: Approval[]): { project: KitchenProject; revision: string; note?: string } | null {
  const current = useEditorStore.getState().project;
  if (!current) return null;
  if (source.kind === 'current') return { project: current, revision: designRevision(current) };
  const a = approvals.find((x) => x.revision === source.revision);
  if (!a) return null;
  const parsed = parseProjectFile(a.file);
  if (!parsed.ok) return null;
  return { project: parsed.project, revision: a.revision, note: `approved ${new Date(a.approvedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` };
}

/** The revision a record would be made from now; differs from the record's → stale. */
export function latestRevisionFor(record: DeliverableRecord, approvals: Approval[]): string | null {
  if (record.source === 'approved') return approvals[0]?.revision ?? null;
  const p = useEditorStore.getState().project;
  return p ? designRevision(p) : null;
}

export function isStale(record: DeliverableRecord, approvals: Approval[]): boolean {
  return latestRevisionFor(record, approvals) !== record.revision;
}

export function configFor(project: KitchenProject, config: DeliverableConfig | null): DeliverableConfig {
  return config ?? DEFAULT_CONFIG(project.preferences.unit);
}

/** Builds the drawing set for a source (used by previews and exports). */
export function drawingSetFor(source: Source, approvals: Approval[], config: DeliverableConfig | null, at = new Date()): DrawingSet | null {
  const s = sourceProject(source, approvals);
  if (!s) return null;
  return buildDrawingSet(s.project, configFor(s.project, config), { generatedAt: at, revisionNote: s.note });
}

export const useDeliverablesStore = create<DeliverablesState>()((set, get) => ({
  config: read<DeliverableConfig | null>(CONFIG_KEY, null),
  source: { kind: 'current' },
  approvals: [],
  history: [],
  section: 'readiness',
  setSection: (section) => set({ section }),
  setConfig: (patch) => {
    const project = useEditorStore.getState().project;
    if (!project) return;
    const config = { ...configFor(project, get().config), ...patch };
    write(CONFIG_KEY, config);
    set({ config });
  },
  setSource: (source) => set({ source }),
  load: (projectId) => {
    if (!projectId) return set({ approvals: [], history: [], source: { kind: 'current' } });
    set({ approvals: read<Approval[]>(KEY(projectId, 'approvals'), []), history: read<DeliverableRecord[]>(KEY(projectId, 'history'), []), source: { kind: 'current' } });
  },
  approveCurrent: () => {
    const project = useEditorStore.getState().project;
    if (!project) return null;
    const revision = designRevision(project);
    const approval: Approval = { revision, approvedAt: new Date().toISOString(), file: serializeProject(project) };
    const approvals = [approval, ...get().approvals.filter((a) => a.revision !== revision)].slice(0, 5);
    write(KEY(project.id, 'approvals'), approvals);
    set({ approvals });
    return approval;
  },
  generate: (kind, sheetId) => {
    const { source, approvals } = get();
    const s = sourceProject(source, approvals);
    if (!s) return null;
    const config = configFor(s.project, get().config);
    const at = new Date();
    const readiness = checkReadiness(s.project, s.revision);
    const base = `${slug(s.project.name)}-${shortRevision(s.revision)}`;
    let fileName: string;
    let mime: string;
    let data: string | Uint8Array;
    const warnings = readiness.issues.filter((i) => i.severity !== 'info').map((i) => i.message);
    if (kind === 'pdf-set' || kind === 'pdf-sheet' || kind === 'svg-sheet') {
      const drawing = buildDrawingSet(s.project, config, { generatedAt: at, revisionNote: s.note });
      const sheets = kind === 'pdf-set' ? drawing.sheets : drawing.sheets.filter((x) => x.id === sheetId);
      if (!sheets.length) return null;
      if (drawing.missing.length) warnings.unshift(`Missing measurements (drawings left out): ${drawing.missing.join(', ')}`);
      if (kind === 'svg-sheet') {
        fileName = `${base}-${sheets[0]!.id}.svg`;
        mime = 'image/svg+xml';
        data = sheetToSvg(sheets[0]!);
      } else {
        fileName = kind === 'pdf-set' ? `${base}-drawings.pdf` : `${base}-${sheets[0]!.id}.pdf`;
        mime = 'application/pdf';
        data = pdfBytes(sheetsToPdf(sheets, { title: `${s.project.name} — ${kind === 'pdf-set' ? 'drawing set' : sheets[0]!.title.title}`, subject: `Revision ${s.revision}${s.note ? ` (${s.note})` : ''}; ${readiness.outputs.drawings.label}; ${readiness.outputs.manufacturing.label}`, created: at }));
      }
    } else if (kind === 'schedule-csv') {
      fileName = `${base}-schedule.csv`;
      mime = 'text/csv;charset=utf-8';
      data = scheduleCsv(s.project, config.scheduleColumns);
    } else if (kind === 'bom-csv') {
      fileName = `${base}-bom.csv`;
      mime = 'text/csv;charset=utf-8';
      data = bomCsv(s.project);
      if (!buildBom(s.project).complete) warnings.unshift('Partial BOM: some cabinets have no verified construction rules.');
    } else if (kind === 'opticut-csv') {
      const pkg = explodeScene(s.project.cabinets, SEED_RULE_PACK_V1, s.project.name);
      fileName = `${base}-opticut-16col.csv`;
      mime = 'text/csv;charset=utf-8';
      data = exportOptiCutCsv(pkg);
    } else if (kind === 'quotation-csv') {
      const pkg = explodeScene(s.project.cabinets, SEED_RULE_PACK_V1, s.project.name);
      const items: QuotationLineItem[] = [
        {
          id: 'item_carcase',
          description: '18mm Carcase Panels (Factory Pre-drilled 32mm System)',
          code: '9403.40.00',
          type: 'goods',
          quantity: Math.max(1, Math.round(pkg.summary.totalCarcaseAreaSqM * 10) / 10),
          unit: 'sqm',
          unitRatePaise: 240000,
        },
        {
          id: 'item_shutters',
          description: '18mm Shutters & Fronts with 2.0mm ABS Edge Banding',
          code: '9403.40.00',
          type: 'goods',
          quantity: Math.max(1, Math.round(pkg.summary.totalShutterAreaSqM * 10) / 10),
          unit: 'sqm',
          unitRatePaise: 360000,
        },
        {
          id: 'item_installation',
          description: 'On-site Installation & Precision Alignment',
          code: '9954.79',
          type: 'services',
          quantity: Math.max(1, s.project.cabinets.length),
          unit: 'nos',
          unitRatePaise: 120000,
        },
      ];
      const quote = calculateQuotation(`QT-${s.project.id.slice(0, 6).toUpperCase()}`, items, 'INTRA_STATE');
      fileName = `${base}-quotation-gst.csv`;
      mime = 'text/csv;charset=utf-8';
      const csvLines = [
        'Item,HSN_SAC,Type,Qty,Unit,Rate_INR,Taxable_INR,CGST_INR,SGST_INR,Total_INR',
        ...quote.items.map((it) => {
          const taxable = (it.quantity * it.unitRatePaise) / 10000;
          const cgst = taxable * 0.09;
          const sgst = taxable * 0.09;
          const total = taxable + cgst + sgst;
          return `"${it.description}",${it.code},${it.type},${it.quantity},${it.unit},${it.unitRatePaise / 100},${taxable},${cgst},${sgst},${total}`;
        }),
        `"TOTAL",,,,,"${quote.formatted.totalTaxable}","${quote.formatted.totalTax}","${quote.formatted.grandTotal}"`,
      ];
      data = csvLines.join('\r\n');
    } else if (kind === 'dxf-plan') {
      fileName = `${base}-cad-plan.dxf`;
      mime = 'application/dxf';
      data = exportPlanDxf(s.project);
    } else {
      const rules = constructionOf(s.project.production.constructionId);
      if (!rules) return null;
      fileName = `${base}-cut-list.csv`;
      mime = 'text/csv;charset=utf-8';
      data = cutListCsv(cutList(s.project, (c) => rules.verified.includes(c.type)));
    }
    const record: DeliverableRecord = {
      id: `${at.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      projectId: s.project.id,
      revision: s.revision,
      source: source.kind,
      sheetId,
      createdAt: at.toISOString(),
      fileName,
      unit: config.unit,
      config,
      readiness: readiness.outputs,
      warnings: warnings.slice(0, 20),
    };
    const history = [record, ...get().history].slice(0, 40);
    write(KEY(s.project.id, 'history'), history);
    set({ history });
    return { fileName, mime, data, record };
  },
  regenerate: (recordId) => {
    const r = get().history.find((x) => x.id === recordId);
    if (!r) return null;
    const { approvals } = get();
    const source: Source = r.source === 'approved' && approvals[0] ? { kind: 'approved', revision: approvals[0].revision } : { kind: 'current' };
    const previous = { source: get().source, config: get().config };
    set({ source, config: r.config });
    try {
      return get().generate(r.kind, r.sheetId);
    } finally {
      set(previous);
    }
  },
}));

// Approvals and history belong to the open project.
let loaded: string | null = null;
useEditorStore.subscribe((s) => {
  const id = s.project?.id ?? null;
  if (id !== loaded) {
    loaded = id;
    useDeliverablesStore.getState().load(id);
  }
});

/** Saves a generated file in the browser. */
export function downloadFile(file: { fileName: string; mime: string; data: string | Uint8Array }): void {
  const blob = new Blob([typeof file.data === 'string' ? file.data : (file.data as Uint8Array<ArrayBuffer>)], { type: file.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type { DeliverableConfig, Paper, ScaleChoice, WallId };
export { elevationWalls };

/**
 * Carries out an action from a chat reply: "open:<section>", "download:<kind>[:<sheet>][:approved]"
 * or "present". Downloads come from the current design or the latest approved revision.
 */
export function runDeliverableAction(action: string): GeneratedFile | null {
  const store = useDeliverablesStore.getState();
  const editor = useEditorStore.getState();
  if (action === 'present') {
    editor.setPresenting(true);
    return null;
  }
  if (action === 'render') {
    useVisionStore.getState().openRender(true);
    return null;
  }
  const [verb, ...rest] = action.split(':');
  if (verb === 'open') {
    store.setSource({ kind: 'current' });
    store.setSection(rest.join(':'));
    editor.setView('drawings');
    return null;
  }
  if (verb !== 'download') return null;
  const approved = rest.at(-1) === 'approved';
  const [kind, sheetId] = rest.filter((x) => x !== 'approved') as [DeliverableKind, string | undefined];
  const previous = store.source;
  const latest = store.approvals[0];
  if (approved && !latest) return null;
  store.setSource(approved ? { kind: 'approved', revision: latest!.revision } : { kind: 'current' });
  try {
    const file = useDeliverablesStore.getState().generate(kind, sheetId);
    if (file) downloadFile(file);
    return file;
  } finally {
    useDeliverablesStore.getState().setSource(previous);
  }
}
