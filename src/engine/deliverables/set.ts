/**
 * Assembles deliverables from one project revision: the drawing set (plan, elevations, schedule
 * and BOM sheets) and the tabular exports. Pure and deterministic for a given project, config and
 * generation time.
 */
import { WALL_LABEL, WALLS, type KitchenProject, type WallId } from '@/domain';
import { UNIT_LABEL, type LengthUnit } from '../measurement/units';
import { buildBom, type Bom } from './bom';
import { toCsv } from './csv';
import { chooseScale, PAPER, rowsPerSheet, type Paper, type ScaleChoice, type Sheet, type TableColumn, type View } from './drawing';
import { elevationView } from './elevationView';
import { DEFAULT_ANNOTATIONS, missingMeasurements, planView, type AnnotationOptions } from './plan';
import { checkReadiness, type Readiness } from './readiness';
import { designRevision, shortRevision } from './revision';
import { SCHEDULE_COLUMNS, scheduleRows } from './schedule';

export interface DeliverableConfig {
  unit: LengthUnit;
  paper: Paper;
  scale: ScaleChoice;
  annotations: Omit<AnnotationOptions, 'unit'>;
  /** Walls to draw elevations of; 'auto' = every wall with something on it. */
  walls: WallId[] | 'auto';
  includePlan: boolean;
  includeSchedule: boolean;
  includeBom: boolean;
  scheduleColumns: string[];
}

export const DEFAULT_CONFIG = (unit: LengthUnit): DeliverableConfig => ({
  unit,
  paper: 'A3',
  scale: 'fit',
  annotations: { ...DEFAULT_ANNOTATIONS },
  walls: 'auto',
  includePlan: true,
  includeSchedule: true,
  includeBom: true,
  scheduleColumns: SCHEDULE_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id),
});

export interface GenerationMeta {
  generatedAt: Date;
  /** Shown beside the revision, e.g. "approved 31 Oct". */
  revisionNote?: string;
}

export interface DrawingSet {
  projectId: string;
  revision: string;
  generatedAt: string;
  config: DeliverableConfig;
  sheets: Sheet[];
  readiness: Readiness;
  /** Measurements that prevented a drawing (the drawing is omitted, not guessed). */
  missing: string[];
  scales: Record<string, string>;
}

const stamp = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export function elevationWalls(project: KitchenProject, config: DeliverableConfig): WallId[] {
  if (config.walls !== 'auto') return config.walls;
  return WALLS.filter((w) => project.openings.some((o) => o.wallId === w) || [...project.cabinets, ...project.appliances].some((e) => e.wallId === w));
}

/** Two passes: a provisional view finds the scale, then the view is built with tiers spaced for it. */
function scaled(build: (scale: number) => View, paper: Paper, choice: ScaleChoice): { view: View; scale: number; label: string } {
  const first = build(1 / 25);
  const s = chooseScale(first, paper, choice);
  const view = build(s.scale);
  const again = chooseScale(view, paper, choice);
  return again.scale === s.scale ? { view, scale: s.scale, label: s.label } : { view: build(again.scale), scale: again.scale, label: again.label };
}

export function buildDrawingSet(project: KitchenProject, config: DeliverableConfig, meta: GenerationMeta): DrawingSet {
  const revision = designRevision(project);
  const readiness = checkReadiness(project, revision);
  const annotations: AnnotationOptions = { ...config.annotations, unit: config.unit };
  const sheets: Omit<Sheet, 'title'>[] = [];
  const titles: { title: string; status: string; scale: string }[] = [];
  const scales: Record<string, string> = {};
  const missing = [...new Set([...missingMeasurements(project, 'plan'), ...missingMeasurements(project, 'elevation')])];
  const drawingStatus = readiness.outputs.drawings.label;

  if (config.includePlan && !missingMeasurements(project, 'plan').length) {
    const p = scaled((s) => planView(project, annotations, s), config.paper, config.scale);
    sheets.push({ id: 'plan', paper: config.paper, body: { kind: 'view', view: p.view, scale: p.scale } });
    titles.push({ title: 'Floor plan', status: drawingStatus, scale: p.label });
    scales.plan = p.label;
  }
  if (!missingMeasurements(project, 'elevation').length) {
    for (const w of elevationWalls(project, config)) {
      const e = scaled((s) => elevationView(project, w, annotations, s), config.paper, config.scale);
      sheets.push({ id: `elev-${w}`, paper: config.paper, body: { kind: 'view', view: e.view, scale: e.scale } });
      titles.push({ title: `${WALL_LABEL[w]} elevation`, status: drawingStatus, scale: e.label });
      scales[`elev-${w}`] = e.label;
    }
  }
  if (config.includeSchedule) {
    const rows = scheduleRows(project, revision);
    const cols = SCHEDULE_COLUMNS.filter((c) => config.scheduleColumns.includes(c.id));
    const columns: TableColumn[] = cols.map((c) => ({ label: c.label, width: c.width, align: c.align }));
    const notes = ['Lengths in millimetres. “not specified” = information still needed from the designer.'];
    paginate(rows.map((r) => cols.map((c) => String(c.value(r)))), config.paper, notes.length).forEach((page, i, all) => {
      sheets.push({ id: `schedule-${i + 1}`, paper: config.paper, body: { kind: 'table', heading: `Cabinet & furniture schedule${all.length > 1 ? ` (${i + 1}/${all.length})` : ''}`, columns, rows: page, notes: i === all.length - 1 ? notes : [] } });
      titles.push({ title: 'Cabinet schedule', status: readiness.outputs.manufacturing.label, scale: '—' });
    });
  }
  if (config.includeBom) {
    const bom = buildBom(project);
    const notes = bomNotes(bom);
    paginate(bomTableRows(bom), config.paper, notes.length).forEach((page, i, all) => {
      sheets.push({ id: `bom-${i + 1}`, paper: config.paper, body: { kind: 'table', heading: `Bill of materials${all.length > 1 ? ` (${i + 1}/${all.length})` : ''}${bom.complete ? '' : ' — PARTIAL'}`, columns: BOM_COLUMNS, rows: page, notes: i === all.length - 1 ? notes : [] } });
      titles.push({ title: 'Bill of materials', status: readiness.outputs.manufacturing.label, scale: '—' });
    });
  }

  const short = project.id.replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase() || 'PRJ';
  const rev = `${shortRevision(revision)}${meta.revisionNote ? ` (${meta.revisionNote})` : ''}`;
  const full: Sheet[] = sheets.map((s, i) => ({
    ...s,
    title: {
      project: project.name,
      projectId: project.id,
      title: titles[i]!.title,
      drawingNo: `IS-${short}-${String(i + 1).padStart(2, '0')}`,
      revision: rev,
      generated: stamp(meta.generatedAt),
      units: s.body.kind === 'view' ? UNIT_LABEL[config.unit] : 'Millimetres (mm)',
      scale: titles[i]!.scale === '—' ? 'n/a' : `${titles[i]!.scale} on ${s.paper}`,
      status: titles[i]!.status,
      sheet: `${i + 1} of ${sheets.length}`,
    },
  }));
  return { projectId: project.id, revision, generatedAt: meta.generatedAt.toISOString(), config, sheets: full, readiness, missing, scales };
}

function paginate(rows: string[][], paper: Paper, notes: number): string[][][] {
  const per = rowsPerSheet(paper, notes);
  const pages: string[][][] = [];
  for (let i = 0; i < rows.length; i += per) pages.push(rows.slice(i, i + per));
  return pages.length ? pages : [[]];
}

export const BOM_COLUMNS: TableColumn[] = [
  { label: 'Category', width: 7 },
  { label: 'Item', width: 14 },
  { label: 'Material', width: 9 },
  { label: 'T', width: 3, align: 'right' },
  { label: 'L', width: 4, align: 'right' },
  { label: 'W', width: 4, align: 'right' },
  { label: 'Qty', width: 3, align: 'right' },
  { label: 'UoM', width: 4 },
  { label: 'Basis', width: 6 },
  { label: 'Units', width: 10 },
];

const num = (v: number | null) => (v === null ? '—' : String(v));

function bomTableRows(bom: Bom): string[][] {
  return bom.lines.map((l) => [l.category, l.item, l.material, num(l.thickness), num(l.length), num(l.width), String(l.qty), l.uom, l.basis, l.refs.join(' ')]);
}

function bomNotes(bom: Bom): string[] {
  const notes: string[] = [];
  if (!bom.rules) notes.push('PARTIAL: no construction method is chosen, so no panels, banding, boards or hardware are listed.');
  if (bom.excluded.length) notes.push(`PARTIAL: left out (no verified cut-list rules): ${bom.excluded.map((e) => e.ref).join(', ')}.`);
  notes.push('“estimated” = board counts and costs; everything else is calculated from the model and the rules. Check before cutting.');
  return notes;
}

// ── Tabular exports ─────────────────────────────────────────────────────────────────────────────

export function scheduleCsv(project: KitchenProject, columns: string[]): string {
  const revision = designRevision(project);
  const cols = SCHEDULE_COLUMNS.filter((c) => columns.includes(c.id) || c.id === 'id' || c.id === 'revision');
  return toCsv(
    cols.map((c) => c.label),
    scheduleRows(project, revision).map((r) => cols.map((c) => c.value(r))),
  );
}

export function bomCsv(project: KitchenProject): string {
  const revision = designRevision(project);
  const bom = buildBom(project);
  return toCsv(
    ['Category', 'Item', 'Material', 'Thickness (mm)', 'Length (mm)', 'Width (mm)', 'Quantity', 'Unit of measure', 'Basis', 'Formula', 'Units', `Unit cost (${bom.currency ?? 'n/a'})`, `Cost (${bom.currency ?? 'n/a'})`, 'Complete', 'Revision'],
    bom.lines.map((l) => [l.category, l.item, l.material, l.thickness, l.length, l.width, l.qty, l.uom, l.basis, l.formula, l.refs.join(' '), l.unitCost, l.cost, bom.complete ? 'yes' : 'no (partial)', revision]),
  );
}

export const paperSize = (p: Paper) => PAPER[p];
