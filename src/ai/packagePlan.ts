/**
 * Turns a chat/voice package request into package commands, resolved against the real package:
 * pages by letter, template or name; dimensions by their measured value; note positions by paper
 * corner. Every edit goes through `executePackageCommand` on a working copy, so the result is
 * validated before anything is shown or stored. Ambiguity becomes a question, never a guess.
 */
import type { KitchenProject } from '@/domain';
import { noteBox, sheetArea } from '@/engine/deliverables/drawing';
import { shortRevision } from '@/engine/deliverables/revision';
import { executePackageCommand, type PackageCommand, type PackageEnv } from '@/engine/package/commands';
import { composePage, dragOverride, sheetNote, STATUS_LABEL, type PackageContext } from '@/engine/package/compose';
import { TECHNICAL, TEMPLATE_LABEL, type ClientPackage, type Note, type Page } from '@/engine/package/schema';
import { cameraAvailable, presentationViews, viewKeyOf, type PresentationView } from '@/engine/package/views';
import type { PackageOp, PackageRequest } from './schema';

export interface PackagePlanEnv extends PackageEnv {
  ctx: PackageContext;
  /** The page open in the studio, if any. */
  currentPageId: string | null;
  /** The latest approved design, for "regenerate … from the approved revision". */
  approved: { project: KitchenProject; revision: string } | null;
}

export type PackagePlan =
  | { kind: 'question'; text: string }
  | {
      kind: 'result';
      title: string;
      lines: string[];
      /** The package after the edits, or null when nothing changes (status questions). */
      next: ClientPackage | null;
      /** Broad, destructive or revision-changing edits wait for the designer's approval. */
      approval: boolean;
      openPageId?: string;
      /** 3D views the app captures after this reply (pageId null = a new page). */
      captures?: { pageId: string | null; view: PresentationView }[];
    };

const question = (text: string): PackagePlan => ({ kind: 'question', text });
const MUTATING_WITHOUT_PAGE = new Set<PackageOp['op']>(['set_info', 'add_page']);
const NO_PAGE = new Set<PackageOp['op']>(['status', 'title_block', 'set_info', 'add_page', 'open', 'add_views', 'recapture_stale']);

/** Pages a reference names, or a question when it does not name exactly what is needed. */
export function resolvePages(pkg: ClientPackage, ref: string | undefined, env: PackagePlanEnv): Page[] | string {
  const r = (ref ?? '').toLowerCase().replace(/\b(the|this|that|page|pages|sheet|sheets)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const current = pkg.pages.find((p) => p.id === env.currentPageId);
  if (!r || r === 'current') return current ? [current] : 'Which page? Open it in the client package, or name it (for example “elevation B” or “the layout”).';
  if (/^(all|every|everything|every one|all of them)$/.test(r)) return pkg.pages;
  if (/^(stale|outdated|out of date|old)$/.test(r)) {
    const stale = pkg.pages.filter((p) => composePage(pkg, p, env.ctx).status === 'stale');
    return stale.length ? stale : 'No page is stale: every generated page matches the current design.';
  }
  const letter = /^(?:elevation\s+)?([a-z])$/.exec(r);
  if (letter) {
    const p = pkg.pages.find((x) => x.label?.toLowerCase() === letter[1]);
    return p ? [p] : `There is no elevation ${letter[1]!.toUpperCase()} in the package (elevations: ${pkg.pages.filter((x) => x.label).map((x) => x.label).join(', ') || 'none'}).`;
  }
  const num = /^(\d+)$/.exec(r);
  if (num) {
    const p = pkg.pages[Number(num[1]) - 1];
    return p ? [p] : `The package has ${pkg.pages.length} pages.`;
  }
  const wall = /\b(back|left|right|front) wall\b/.exec(r);
  if (wall) {
    const ps = pkg.pages.filter((p) => p.template === 'elevation' && p.wallId === wall[1]);
    if (ps.length) return ps;
  }
  const byTemplate = (t: Page['template']) => pkg.pages.filter((p) => p.template === t);
  if (/^elevations$/.test(r)) return byTemplate('elevation');
  const tpl: [RegExp, Page['template']][] = [
    [/^(layout|kitchen layout|plan|floor plan)$/, 'layout'],
    [/^(hardware|accessories|hardware board|board|reference images|hardware (and|&) accessories)$/, 'hardware'],
    [/^(3d|3d view|presentation|view|render)$/, 'presentation'],
    [/^(schedule|cabinet schedule)$/, 'schedule'],
    [/^elevation$/, 'elevation'],
  ];
  for (const [re, t] of tpl) {
    if (!re.test(r)) continue;
    const ps = byTemplate(t);
    if (ps.length === 1) return ps;
    if (!ps.length) return `There is no ${TEMPLATE_LABEL[t].toLowerCase()} page in the package.`;
    return `Which ${TEMPLATE_LABEL[t].toLowerCase()} page? ${ps.map((p) => `“${p.name}”`).join(', ')}.`;
  }
  const named = pkg.pages.filter((p) => p.name.toLowerCase().includes(r));
  if (named.length === 1) return named;
  if (named.length > 1) return `Several pages match “${ref}”: ${named.map((p) => `“${p.name}”`).join(', ')}. Which one?`;
  return `There is no page called “${ref}”.`;
}

/** Top-left corner (paper mm) that puts a note of this text in a corner of the drawing area. */
function notePosition(page: Page, note: Pick<Note, 'text' | 'size' | 'bold'>, position: string): { x: number; y: number } {
  const area = sheetArea({ paper: page.paper, orientation: page.orientation, client: { cells: [], revisions: [], studio: '', studioLines: [] }, heading: page.heading || undefined });
  const box = noteBox(sheetNote({ id: 'n', x: 0, y: 0, color: 'red', ...note }));
  const m = 4;
  const left = area.x + m;
  const right = area.x + area.w - box.w - m;
  const top = area.y + m;
  const bottom = area.y + area.h - box.h - m;
  const at = { 'top-left': [left, top], 'top-right': [right, top], 'bottom-left': [left, bottom], 'bottom-right': [right, bottom], centre: [area.x + (area.w - box.w) / 2, area.y + (area.h - box.h) / 2] }[position] ?? [left, top];
  return { x: Math.round(at[0]!), y: Math.round(at[1]!) };
}

export function planPackageRequest(pkg: ClientPackage, req: PackageRequest, env: PackagePlanEnv): PackagePlan {
  let work = pkg;
  const lines: string[] = [];
  const touched = new Set<string>();
  let approval = false;
  let openPageId: string | undefined;
  let targets: Page[] | null = null;
  const captures: { pageId: string | null; view: PresentationView }[] = [];
  const views = presentationViews(env.project);
  const viewOf = (p: Page) => (p.snapshot?.camera && cameraAvailable(env.project, p.snapshot.camera) ? views.find((v) => v.key === viewKeyOf(p.snapshot!.camera!)) : undefined);
  /** A view by what the designer called it: "overall", "back wall", "island", "top", a viewpoint name. */
  const viewNamed = (name: string) => {
    const n = name.toLowerCase().replace(/\b(the|view|run|3d)\b/g, ' ').replace(/\s+/g, ' ').trim();
    return views.find((v) => v.key === n || v.label.toLowerCase().replace(/\b(view|run)\b/g, ' ').replace(/\s+/g, ' ').trim() === n) ?? views.find((v) => v.label.toLowerCase().includes(n));
  };
  const needsPages = req.ops.some((o) => !NO_PAGE.has(o.op)) || req.ops.some((o) => o.op === 'open' && req.page);
  if (needsPages) {
    const r = resolvePages(work, req.page, env);
    if (typeof r === 'string') return question(r);
    targets = r;
  }
  const run = (cmd: PackageCommand, e: PackageEnv = env): string | null => {
    const res = executePackageCommand(work, cmd, e);
    if (!res.ok) return res.error;
    work = res.package;
    if ('pageId' in cmd) touched.add(cmd.pageId);
    if (res.selectPageId) openPageId = res.selectPageId;
    return null;
  };
  const pageNow = (id: string) => work.pages.find((p) => p.id === id)!;

  for (const op of req.ops) {
    switch (op.op) {
      case 'status': {
        const composed = work.pages.map((p) => ({ p, c: composePage(work, p, env.ctx) }));
        const notCurrent = composed.filter((x) => x.c.status === 'stale' || x.c.status === 'needs-review' || x.c.status === 'missing-source');
        lines.push(notCurrent.length ? `${notCurrent.length} of ${work.pages.length} pages need attention:` : `All ${work.pages.length} pages match the current design.`);
        for (const { p, c } of notCurrent) lines.push(`${p.name}: ${STATUS_LABEL[c.status]}${c.reasons[0] ? ` — ${c.reasons[0]}` : ''}`);
        break;
      }
      case 'title_block': {
        const filled = Object.entries(work.info).filter(([, v]) => v).map(([k]) => k);
        const empty = Object.entries(work.info).filter(([, v]) => !v).map(([k]) => k);
        lines.push(`Every page already carries the studio title block (project, client, address, date, scale, drawn/approved/reference by, revisions, studio).`);
        lines.push(empty.length ? `Still empty: ${empty.join(', ')}. Tell me the values, e.g. “set the client to …”.` : `All fields are filled in (${filled.length}).`);
        break;
      }
      case 'add_views': {
        const shown = new Set(work.pages.flatMap((p) => (p.snapshot?.camera ? [viewKeyOf(p.snapshot.camera)] : [])));
        const missing = views.filter((v) => (v.key === 'overall' || v.key.startsWith('run-') || v.key === 'island') && !shown.has(v.key));
        if (!missing.length) lines.push('Every standard 3D view already has a page.');
        else {
          captures.push(...missing.map((view) => ({ pageId: null, view })));
          lines.push(`Adding a 3D page for: ${missing.map((v) => v.label).join(', ')}. Each is captured from the current design and can be captured again after changes.`);
        }
        break;
      }
      case 'recapture_stale': {
        const stale = work.pages.filter((p) => p.template === 'presentation' && composePage(work, p, env.ctx).status === 'stale');
        const again = stale.flatMap((p) => {
          const view = viewOf(p);
          return view ? [{ pageId: p.id, view }] : [];
        });
        const manual = stale.filter((p) => !viewOf(p));
        captures.push(...again);
        lines.push(again.length ? `Capturing ${again.length} stale 3D view${again.length === 1 ? '' : 's'} again: ${again.map((c) => c.view.label).join(', ')}.` : 'No stale 3D view can be captured again automatically.');
        if (manual.length) lines.push(`Set these up by hand in the 3D view and capture them on their page: ${manual.map((p) => p.name).join(', ')}.`);
        break;
      }
      case 'open':
        openPageId = targets?.[0]?.id ?? env.currentPageId ?? work.pages[0]?.id;
        break;
      case 'set_info': {
        const err = run({ type: 'set-info', patch: { [op.field]: op.value } });
        if (err) return question(err);
        lines.push(`Title block ${op.field}: “${op.value}” (all pages).`);
        break;
      }
      case 'add_page': {
        if (op.template === 'elevation' && !op.wall) return question('Which wall should the new elevation show: back, left, right or front?');
        const err = run({ type: 'add-page', template: op.template, wallId: op.wall });
        if (err) return question(err);
        const added = work.pages.find((p) => p.id === openPageId)!;
        lines.push(`Added “${added.name}”${TECHNICAL.includes(added.template) ? ` from revision ${shortRevision(added.source!.revision)}` : ''}.`);
        targets = [added];
        break;
      }
      default: {
        for (const t of targets ?? []) {
          const page = pageNow(t.id);
          const err = pageOp(op, page);
          if (err) return question(err);
        }
      }
    }
  }

  function pageOp(op: PackageOp, page: Page): string | null {
    switch (op.op) {
      case 'add_note': {
        const note = { text: op.text, size: 3, bold: true };
        const at = notePosition(page, note, op.position ?? 'top-left');
        const err = run({ type: 'add-note', pageId: page.id, note: { ...note, ...at, color: op.color ?? 'red' } });
        if (!err) lines.push(`${page.name}: note “${op.text}” added${op.position ? ` (${op.position})` : ''}.`);
        return err;
      }
      case 'move_note': {
        const note = op.match ? page.notes.find((n) => n.text.toLowerCase().includes(op.match!.toLowerCase())) : page.notes.at(-1);
        if (!note) return op.match ? `${page.name} has no note containing “${op.match}”.` : `${page.name} has no notes.`;
        const err = run({ type: 'update-note', pageId: page.id, noteId: note.id, patch: notePosition(page, note, op.position) });
        if (!err) lines.push(`${page.name}: note moved to the ${op.position.replace('-', ' ')}.`);
        return err;
      }
      case 'set_orientation':
      case 'set_paper': {
        const err = run({ type: 'update-page', pageId: page.id, patch: op.op === 'set_orientation' ? { orientation: op.orientation } : { paper: op.paper } });
        if (!err) lines.push(`${page.name}: ${op.op === 'set_orientation' ? op.orientation : op.paper}.`);
        return err;
      }
      case 'rename_page': {
        const err = run({ type: 'update-page', pageId: page.id, patch: { name: op.name } });
        if (!err) lines.push(`“${page.name}” renamed to “${op.name}”.`);
        return err;
      }
      case 'set_heading': {
        const err = run({ type: 'update-page', pageId: page.id, patch: { heading: op.text } });
        if (!err) lines.push(op.text ? `${page.name}: heading “${op.text}”.` : `${page.name}: heading removed.`);
        return err;
      }
      case 'move_dimension':
      case 'hide_dimension': {
        if (!TECHNICAL.includes(page.template) || page.template === 'schedule') return `${page.name} has no dimensions.`;
        const dims = composePage(work, page, env.ctx).handles.filter((h) => h.kind === 'dim' && !h.hidden && h.value === op.value);
        if (!dims.length) return `There is no ${op.value} mm dimension on ${page.name}. Dimensions are measured from the design; to change a size, ask me to change the unit itself.`;
        if (dims.length > 1) return `${page.name} has ${dims.length} dimensions of ${op.value} mm. Select the one you mean on the page and drag it (or use the arrow keys).`;
        const h = dims[0]!;
        const prev = page.overrides[h.key];
        let override;
        if (op.op === 'hide_dimension') override = { dx: prev?.dx ?? 0, dy: prev?.dy ?? 0, hidden: true };
        else {
          const d = op.distance ?? 6;
          if (op.direction === 'away' || op.direction === 'closer') override = { dx: prev?.dx ?? 0, dy: Math.round(((prev?.dy ?? 0) + (op.direction === 'away' ? d : -d)) * 10) / 10 };
          else {
            const [px, py] = { up: [0, -d], down: [0, d], left: [-d, 0], right: [d, 0] }[op.direction];
            override = dragOverride(h, prev, px!, py!);
          }
        }
        const err = run({ type: 'set-override', pageId: page.id, key: h.key, override });
        if (!err) lines.push(op.op === 'hide_dimension' ? `${page.name}: the ${op.value} mm dimension is hidden on this page (the design is unchanged).` : `${page.name}: the ${op.value} mm dimension moved ${op.direction === 'away' || op.direction === 'closer' ? `${op.direction}${op.direction === 'away' ? ' from' : ' to'} the object` : op.direction}; it still reads ${h.label}.`);
        return err;
      }
      case 'resize_images': {
        if (page.template !== 'hardware') return `${page.name} is not a hardware board.`;
        const cols = page.columns ?? 5;
        const next = op.change === 'larger' ? cols - 1 : cols + 1;
        if (next < 1 || next > 6) return `The images on ${page.name} are already as ${op.change === 'larger' ? 'large' : 'small'} as they go (${cols} per row).`;
        const err = run({ type: 'update-page', pageId: page.id, patch: { columns: next } });
        if (!err) lines.push(`${page.name}: ${next} images per row (${op.change}).`);
        return err;
      }
      case 'delete_page': {
        approval = true;
        const err = run({ type: 'remove-page', pageId: page.id });
        if (!err) lines.push(`Delete “${page.name}”.`);
        return err;
      }
      case 'move_page': {
        const i = work.pages.findIndex((p) => p.id === page.id);
        const to = op.to === 'first' ? 0 : op.to === 'last' ? work.pages.length - 1 : op.to === 'up' ? i - 1 : op.to === 'down' ? i + 1 : op.to - 1;
        if (to < 0 || to >= work.pages.length) return `“${page.name}” cannot move there (the package has ${work.pages.length} pages).`;
        const err = run({ type: 'move-page', pageId: page.id, to });
        if (!err) lines.push(`“${page.name}” is now page ${to + 1}.`);
        return err;
      }
      case 'capture_view': {
        if (page.template !== 'presentation') return `${page.name} is not a 3D view page. Say “add the standard 3D views”, or add a 3D view page first.`;
        const view = op.view ? viewNamed(op.view) : viewOf(page);
        if (!view) return op.view ? `There is no 3D view called “${op.view}” (views: ${views.map((v) => v.label).join(', ')}).` : `${page.name} was captured from a hand-set camera; say which view to capture (${views.map((v) => v.label).join(', ')}).`;
        captures.push({ pageId: page.id, view });
        lines.push(`${page.name}: capturing the ${view.label.toLowerCase()} from the current design.`);
        return null;
      }
      case 'regenerate': {
        if (!TECHNICAL.includes(page.template)) return `${page.name} is not generated from the design${page.template === 'presentation' ? '; say “capture it again” instead' : ''}.`;
        let e: PackageEnv = env;
        if (op.revision === 'approved') {
          if (!env.approved) return 'No revision has been approved yet. Approve the design in Deliverables › Readiness first.';
          e = { ...env, project: env.approved.project };
          approval = true;
        }
        const err = run({ type: 'regenerate-page', pageId: page.id }, e);
        if (!err) {
          const orphans = composePage(work, pageNow(page.id), env.ctx).orphaned.length;
          lines.push(`Regenerate “${page.name}” from ${op.revision === 'approved' ? `the approved revision ${shortRevision(env.approved!.revision)}` : 'the current design'}; notes and label positions are kept${orphans ? ` (${orphans} edit${orphans === 1 ? ' no longer matches' : 's no longer match'} and will be listed for review)` : ''}.`);
        }
        return err;
      }
      default:
        return null;
    }
  }

  const changedPages = [...touched].filter((id) => pkg.pages.some((p) => p.id === id));
  if (changedPages.length > 1 && !req.ops.every((o) => MUTATING_WITHOUT_PAGE.has(o.op))) approval = true;
  if (!openPageId && targets?.length === 1) openPageId = targets[0]!.id;
  const changed = work !== pkg;
  const statusOnly = req.ops.every((o) => o.op === 'status');
  if (captures.length) return { kind: 'result', title: 'Capturing 3D views', lines, next: changed ? work : null, approval: false, openPageId, captures };
  const title = statusOnly ? 'Package pages' : req.ops.every((o) => o.op === 'title_block') ? 'Title block' : changed ? (approval ? 'Package changes to approve' : 'Package updated') : 'Client package';
  if (targets && targets.length > 1 && changed) lines.unshift(`${changedPages.length} pages: ${targets.map((p) => p.name).join(', ')}.`);
  return { kind: 'result', title, lines, next: changed ? work : null, approval, openPageId };
}
