/**
 * Readiness of the three kinds of output, checked before anything is labelled ready:
 * client presentation, technical drawings and manufacturing (cut list / BOM). A project can be
 * presentable but not ready for fabrication. Blocking = the output must not be used for its purpose;
 * warning = usable with stated assumptions or omissions; info = more data would help.
 */
import { allElements, validateProject, type KitchenProject } from '@/domain';
import { designChecks } from '../checks/designChecks';
import { buildModel } from '../geometry/parts';
import { unitRefs } from '../production/schedule';
import { constructionOf } from './construction';
import { missingMeasurements } from './plan';
import { scheduleRows } from './schedule';

export type OutputKind = 'presentation' | 'drawings' | 'manufacturing';
export type Severity = 'blocking' | 'warning' | 'info';

export interface ReadinessIssue {
  severity: Severity;
  outputs: OutputKind[];
  code: string;
  message: string;
  entityIds: string[];
}

export interface OutputReadiness {
  status: 'ready' | 'warnings' | 'blocked';
  label: string;
}

export interface Readiness {
  revision: string;
  outputs: Record<OutputKind, OutputReadiness>;
  issues: ReadinessIssue[];
}

const LABELS: Record<OutputKind, Record<OutputReadiness['status'], string>> = {
  presentation: { ready: 'Ready to present', warnings: 'Presentable, with notes', blocked: 'Not ready to present' },
  drawings: { ready: 'Drawings ready', warnings: 'Drawings usable, with notes', blocked: 'Drawings not ready' },
  manufacturing: { ready: 'Manufacturing-ready', warnings: 'Draft: not manufacturing-ready', blocked: 'Not ready for manufacturing' },
};

export function checkReadiness(project: KitchenProject, revision: string): Readiness {
  const issues: ReadinessIssue[] = [];
  const add = (severity: Severity, outputs: OutputKind[], code: string, message: string, entityIds: string[] = []) => issues.push({ severity, outputs, code, message, entityIds });
  const refs = unitRefs(project);
  const label = (id: string) => refs.get(id) ?? id;

  for (const m of missingMeasurements(project, 'plan').concat(missingMeasurements(project, 'elevation'))) add('blocking', ['drawings', 'manufacturing'], 'missing-dimension', `Missing measurement: ${m}.`);

  // Identifiers must be unique across units and openings.
  const ids = [...allElements(project).map((e) => e.id), ...project.openings.map((o) => o.id)];
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) add('blocking', ['drawings', 'manufacturing'], 'duplicate-id', `The id “${id}” is used by more than one object.`, [id]);

  for (const i of validateProject(project)) add('blocking', ['drawings', 'manufacturing'], `geometry-${i.code}`, `Unresolved geometry conflict: ${i.message}`, i.entityIds);
  if (validateProject(project).length) add('warning', ['presentation'], 'geometry', 'The design has unresolved conflicts; the presentation shows them as modelled.');
  for (const c of designChecks(project).filter((x) => x.severity === 'warning')) add('warning', ['drawings', 'manufacturing'], `check-${c.code}`, c.message, c.entityIds);

  const rules = constructionOf(project.production.constructionId);
  if (!project.production.constructionId) add('blocking', ['manufacturing'], 'no-construction', 'No construction method is chosen, so there are no panel thicknesses, joinery or edge-banding rules. Choose one in Deliverables › Manufacturing settings.');
  else if (!rules) add('blocking', ['manufacturing'], 'unknown-construction', `The construction method “${project.production.constructionId}” is not defined.`);

  const rows = scheduleRows(project, revision);
  if (rules) {
    for (const r of rows.filter((x) => x.category === 'cabinet' && !rules.verified.includes(x.type as never))) {
      add('blocking', ['manufacturing'], 'unsupported-type', `${r.ref} (${r.typeLabel}): ${rules.unsupported[r.type as never] ?? 'not covered by the construction rules'} It is left out of the cut list.`, [r.id]);
    }
    if (!rules.edgeBanding) add('warning', ['manufacturing'], 'no-banding', 'The construction rules define no edge banding.');
    // Panels must come out positive and at the rule thicknesses.
    for (const c of project.cabinets.filter((x) => rules.verified.includes(x.type))) {
      const bad = buildModel(c).parts.filter((p) => p.body && (p.size.x <= 0 || p.size.y <= 0 || p.size.z <= 0));
      if (bad.length) add('blocking', ['manufacturing'], 'inconsistent-component', `${label(c.id)} has panels with no size (${bad.map((p) => p.key).join(', ')}).`, [c.id]);
    }
  }
  const need = (field: 'hinge' | 'drawerRunner' | 'handle', what: string, uses: (r: (typeof rows)[number]) => boolean) => {
    const users = rows.filter(uses);
    if (users.length && !project.production[field]) add('warning', ['manufacturing'], `no-${field}`, `No ${what} product is specified (used by ${users.map((u) => u.ref).join(', ')}); the BOM lists a generic ${what}.`, users.map((u) => u.id));
  };
  need('hinge', 'hinge', (r) => r.doors > 0);
  need('drawerRunner', 'drawer runner', (r) => r.drawers > 0);
  need('handle', 'handle', (r) => r.handle.status !== 'n/a');
  if (project.production.wastePercent === undefined && rules) add('warning', ['manufacturing'], 'no-waste', `No waste allowance is configured; board counts are a minimum (the rule set suggests ${rules.defaultWastePercent} %).`);
  for (const r of rows.filter((x) => x.category === 'cabinet' && x.finish.status === 'unspecified')) add('blocking', ['manufacturing'], 'no-material', `${r.ref} has no front material.`, [r.id]);
  if (rows.some((r) => r.category === 'cabinet' && r.carcass.status === 'unspecified')) add('blocking', ['manufacturing'], 'no-carcass', 'The carcass material is not defined.');

  if (project.appliances.length) add('info', ['manufacturing'], 'appliance-models', `Appliance models are not specified (${project.appliances.map((a) => label(a.id)).join(', ')}); confirm sizes and installation clearances with the chosen models.`, project.appliances.map((a) => a.id));
  if (!project.production.prices) add('info', ['manufacturing'], 'no-prices', 'No prices are configured, so the BOM has no cost estimate.');
  if (project.furniture.length) add('info', ['manufacturing'], 'furniture', 'Loose furniture is listed as bought in, not manufactured.', project.furniture.map((f) => f.id));
  add('info', ['manufacturing'], 'end-panels', 'End panels, decorative panels and scribe fillers at walls are not modelled; add them in the workshop drawings if needed.');
  add('info', ['drawings', 'manufacturing'], 'codes', 'Building regulations and appliance installation requirements are not checked.');

  const outputs = Object.fromEntries(
    (['presentation', 'drawings', 'manufacturing'] as OutputKind[]).map((o) => {
      const mine = issues.filter((i) => i.outputs.includes(o));
      const status: OutputReadiness['status'] = mine.some((i) => i.severity === 'blocking') ? 'blocked' : mine.some((i) => i.severity === 'warning') ? 'warnings' : 'ready';
      return [o, { status, label: LABELS[o][status] }];
    }),
  ) as Record<OutputKind, OutputReadiness>;
  return { revision, outputs, issues };
}
