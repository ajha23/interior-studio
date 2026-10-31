/**
 * Deliverable requests from chat and voice ("generate a dimensioned floor plan", "what is missing
 * before I send this to the carpenter?"), answered from the engine — never from model text.
 */
import type { DeliverableReply } from '@/ai/conversation';
import { typeAlias } from '@/ai/resolve';
import type { DeliverableRequest } from '@/ai/schema';
import { WALL_LABEL } from '@/domain';
import { buildBom } from '@/engine/deliverables/bom';
import { shortRevision } from '@/engine/deliverables/revision';
import { querySchedule, scheduleRows } from '@/engine/deliverables/schedule';
import { elevationWalls } from '@/engine/deliverables/set';
import { configFor, drawingSetFor, sourceProject, useDeliverablesStore } from './deliverablesStore';

export function deliverableReply(req: DeliverableRequest): DeliverableReply {
  const { approvals, config: stored } = useDeliverablesStore.getState();
  const approved = req.revision === 'approved';
  if (approved && !approvals.length) {
    return { title: 'No approved revision', lines: ['No revision has been approved yet. Approve the current design in Deliverables › Readiness, then ask again.'], actions: [{ label: 'Open readiness', action: 'open:readiness' }], revision: '' };
  }
  const source = approved ? ({ kind: 'approved', revision: approvals[0]!.revision } as const) : ({ kind: 'current' } as const);
  const src = sourceProject(source, approvals)!;
  const set = drawingSetFor(source, approvals, stored)!;
  const config = configFor(src.project, stored);
  const rev = `revision ${shortRevision(src.revision)}${approved ? ' (approved)' : ''}`;
  const sourceTag = approved ? ':approved' : '';
  const r = set.readiness;
  const issueLines = (output: 'drawings' | 'manufacturing') => r.issues.filter((i) => i.outputs.includes(output) && i.severity !== 'info').map((i) => `${i.severity === 'blocking' ? 'Blocking' : 'Warning'}: ${i.message}`);

  switch (req.action) {
    case 'plan': {
      const plan = set.sheets.find((s) => s.id === 'plan');
      if (!plan) return { title: 'Floor plan', lines: [`The plan cannot be drawn: missing ${set.missing.join(', ')}.`], actions: [], revision: src.revision };
      const dims = plan.body.kind === 'view' ? plan.body.view.prims.filter((p) => p.t === 'dim').length : 0;
      return {
        title: 'Dimensioned floor plan',
        lines: [`Floor plan of the ${src.project.room.width} × ${src.project.room.length} mm room (walls ${src.project.room.wallThickness} mm), ${plan.title.scale}, ${dims} dimensions measured from the model, ${rev}.`, r.outputs.drawings.label + '.', ...issueLines('drawings').slice(0, 4)],
        actions: [{ label: 'Open the plan', action: 'open:sheet:plan' }, { label: 'Download PDF', action: `download:pdf-sheet:plan${sourceTag}` }, { label: 'Download SVG', action: `download:svg-sheet:plan${sourceTag}` }],
        revision: src.revision,
      };
    }
    case 'elevations': {
      const walls = req.walls?.length ? req.walls : elevationWalls(src.project, { ...config, walls: 'auto' }).filter((w) => !req.kitchenWalls || [...src.project.cabinets, ...src.project.appliances].some((e) => e.wallId === w));
      const sheets = set.sheets.filter((s) => walls.some((w) => s.id === `elev-${w}`));
      const missingWalls = walls.filter((w) => !sheets.some((s) => s.id === `elev-${w}`));
      return {
        title: 'Elevations',
        lines: [
          ...sheets.map((s) => `${s.title.title}: ${s.title.scale}, unit widths and heights from the model.`),
          ...missingWalls.map((w) => `${WALL_LABEL[w]}: nothing is modelled on this wall, so there is no elevation.`),
          ...(set.missing.length ? [`Missing measurements: ${set.missing.join(', ')}.`] : []),
          `${rev}.`,
        ],
        actions: [...sheets.map((s) => ({ label: `Open ${s.title.title.toLowerCase()}`, action: `open:sheet:${s.id}` })), { label: 'Download PDF set', action: `download:pdf-set${sourceTag}` }],
        revision: src.revision,
      };
    }
    case 'schedule': {
      const alias = req.filter?.type ? typeAlias(req.filter.type) : null;
      const fromAlias = alias && alias.category !== 'opening' && alias.category !== 'wall' ? alias.category : undefined;
      const rows = querySchedule(scheduleRows(src.project, src.revision), { category: req.filter?.category ?? fromAlias ?? 'all', type: alias?.type ?? 'all' })[0]!.rows;
      const incomplete = rows.filter((x) => x.status === 'incomplete').length;
      return {
        title: `Schedule${alias?.type ? ` of ${req.filter!.type} units` : ''}`,
        lines: [`${rows.length} object${rows.length === 1 ? '' : 's'}, ${rev}. ${incomplete ? `${incomplete} still miss manufacturing information.` : 'No missing manufacturing information.'}`],
        table: { columns: ['Ref', 'Type', 'W × H × D (mm)', 'Wall / run', 'Finish', 'Status'], rows: rows.map((x) => [x.ref, x.typeLabel, `${x.width} × ${x.height} × ${x.depth}`, x.run, x.finish.value, x.status === 'incomplete' ? `missing ${x.missing.length}` : x.status]) },
        actions: [{ label: 'Open the schedule', action: 'open:schedule' }, { label: 'Download CSV', action: `download:schedule-csv${sourceTag}` }],
        revision: src.revision,
      };
    }
    case 'bom': {
      const bom = buildBom(src.project);
      const pieces = bom.lines.filter((l) => l.uom === 'pcs' && !['hardware', 'appliance', 'furniture', 'worktop'].includes(l.category)).reduce((n, l) => n + l.qty, 0);
      const sheets = bom.lines.filter((l) => l.category === 'board').map((l) => `${l.qty} × ${l.material} ${l.thickness} mm`);
      return {
        title: bom.complete ? 'Bill of materials' : 'Bill of materials (partial)',
        lines: [
          bom.rules ? `${pieces} panels in ${bom.lines.filter((l) => l.uom === 'pcs' && l.category !== 'hardware').length} sizes, ${bom.lines.filter((l) => l.category === 'worktop').length} worktops, ${bom.lines.filter((l) => l.category === 'hardware').length} hardware items, boards (estimated): ${sheets.join(', ') || 'none'}.` : 'No construction method is chosen, so no panels, edge banding, boards or hardware can be listed.',
          ...(bom.excluded.length ? [`Left out (no verified rules): ${bom.excluded.map((e) => e.ref).join(', ')}.`] : []),
          bom.totalCost !== null ? `Estimated cost of priced lines: ${bom.totalCost} ${bom.currency}.` : 'No prices configured, so no cost estimate.',
          `${rev}.`,
        ],
        actions: [{ label: 'Open the BOM', action: 'open:bom' }, { label: 'Download BOM CSV', action: `download:bom-csv${sourceTag}` }],
        revision: src.revision,
      };
    }
    case 'readiness': {
      const lines = issueLines('manufacturing');
      return {
        title: r.outputs.manufacturing.label,
        lines: lines.length ? [`Before this goes to the carpenter (${rev}):`, ...lines] : [`Nothing is missing for manufacturing (${rev}).`],
        actions: [{ label: 'Open readiness & settings', action: 'open:readiness' }],
        revision: src.revision,
      };
    }
    case 'export-pdf':
    case 'regenerate':
      return {
        title: req.action === 'regenerate' ? `Drawings for ${rev}` : 'PDF drawing set',
        lines: [`${set.sheets.length} sheets (${set.sheets.map((s) => s.title.title).filter((t, i, a) => a.indexOf(t) === i).join(', ')}), ${rev}. ${r.outputs.drawings.label}; ${r.outputs.manufacturing.label}.`, ...(set.missing.length ? [`Left out (missing measurements): ${set.missing.join(', ')}.`] : [])],
        actions: [{ label: 'Download PDF', action: `download:pdf-set${sourceTag}` }, { label: 'Preview in Deliverables', action: 'open:sheet:plan' }],
        revision: src.revision,
      };
    case 'export-csv': {
      const kind = req.csv ?? 'schedule';
      return {
        title: kind === 'bom' ? 'BOM CSV' : kind === 'cutlist' ? 'Cut list CSV' : 'Schedule CSV',
        lines: [kind === 'cutlist' && !buildBom(src.project).rules ? 'Choose a construction method first: there is no cut list without one.' : `Ready to download, ${rev}.`],
        actions: [{ label: 'Download CSV', action: `download:${kind === 'bom' ? 'bom-csv' : kind === 'cutlist' ? 'cutlist-csv' : 'schedule-csv'}${sourceTag}` }],
        revision: src.revision,
      };
    }
    case 'present':
      return { title: 'Client presentation', lines: [`The live 3D model of ${rev} with editing tools hidden. ${r.outputs.presentation.label}.`], actions: [{ label: 'Start presentation', action: 'present' }], revision: src.revision };
  }
}
