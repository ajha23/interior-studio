/**
 * Client-package requests from chat and voice ("add a note that the LED strip goes in after the
 * kitchen is finished", "which pages are outdated?"). The request is planned against the real
 * package (src/ai/packagePlan.ts); small edits to one page are applied at once and can be undone,
 * broad or destructive ones wait for Apply. Nothing here changes the design.
 */
import type { DeliverableReply } from '@/ai/conversation';
import { planPackageRequest } from '@/ai/packagePlan';
import type { PackageRequest } from '@/ai/schema';
import { newId } from '@/domain';
import { designRevision } from '@/engine/deliverables/revision';
import type { ClientPackage } from '@/engine/package/schema';
import { sourceProject, useDeliverablesStore } from './deliverablesStore';
import { useEditorStore } from './editorStore';
import { captureViews } from './packageCapture';
import { packageContext, usePackageStore } from './packageStore';

interface Pending {
  base: ClientPackage;
  next: ClientPackage;
  summary: string;
  openPageId?: string;
}
const pending = new Map<string, Pending>();

export function packageReply(req: PackageRequest): DeliverableReply {
  const store = usePackageStore.getState();
  const project = useEditorStore.getState().project;
  const ctx = packageContext();
  const revision = project ? designRevision(project) : '';
  if (!project || !ctx) return { title: 'Client package', lines: ['Open a project first.'], actions: [], revision };
  if (!store.pkg) {
    return { title: 'No client package yet', lines: ['This project has no client package. Create one first: a layout, an elevation per wall, a hardware board, a 3D view and the schedule, all from the current design.'], actions: [{ label: 'Create client package', action: 'package:create' }], revision };
  }
  const { approvals } = useDeliverablesStore.getState();
  const approvedSrc = approvals[0] ? sourceProject({ kind: 'approved', revision: approvals[0].revision }, approvals) : null;
  const plan = planPackageRequest(store.pkg, req, {
    project,
    now: new Date(),
    newId,
    ctx,
    currentPageId: useDeliverablesStore.getState().section === 'package' && useEditorStore.getState().view === 'drawings' ? store.pageId : null,
    approved: approvedSrc ? { project: approvedSrc.project, revision: approvedSrc.revision } : null,
  });
  if (plan.kind === 'question') return { title: 'Client package', lines: [plan.text], actions: [{ label: 'Open the client package', action: 'package:open' }], revision };
  const open = { label: 'Open the page', action: `package:open${plan.openPageId ? `:${plan.openPageId}` : ''}` };
  if (plan.captures?.length) {
    // Capturing shows the 3D view briefly for each picture; the result arrives as the studio's message.
    if (plan.next) store.applyPackage(plan.next, plan.lines.join(' '));
    void captureViews(plan.captures).then(() => openStudio(plan.captures!.length === 1 ? (plan.captures![0]!.pageId ?? undefined) : undefined));
    return { title: plan.title, lines: [...plan.lines, 'The 3D view is shown briefly for each picture.'], actions: [open], revision };
  }
  if (!plan.next) return { title: plan.title, lines: plan.lines, actions: [open], revision };
  if (plan.approval) {
    const id = newId('pkgop');
    pending.set(id, { base: store.pkg, next: plan.next, summary: plan.lines.join(' '), openPageId: plan.openPageId });
    return { title: plan.title, lines: [...plan.lines, 'Nothing is changed until you apply it.'], actions: [{ label: 'Apply', action: `package:apply:${id}` }, { label: 'Cancel', action: `package:cancel:${id}` }], revision };
  }
  store.applyPackage(plan.next, plan.lines.join(' '));
  return { title: plan.title, lines: [...plan.lines, 'Undo in the package studio reverts it; the design is unchanged.'], actions: [open, { label: 'Undo', action: 'package:undo' }], revision };
}

function openStudio(pageId?: string): void {
  useDeliverablesStore.getState().setSection('package');
  useEditorStore.getState().setView('drawings');
  if (pageId && usePackageStore.getState().pkg?.pages.some((p) => p.id === pageId)) usePackageStore.getState().selectPage(pageId);
}

/** Carries out a button of a package reply: package:create | open[:page] | apply:<id> | cancel:<id> | undo. */
export function runPackageAction(action: string): void {
  const [, verb, arg] = action.split(':');
  const store = usePackageStore.getState();
  if (verb === 'create') {
    store.createStarter();
    openStudio();
  } else if (verb === 'open') openStudio(arg);
  else if (verb === 'undo') store.undo();
  else if (verb === 'cancel') {
    pending.delete(arg ?? '');
    usePackageStore.setState({ message: { text: 'Cancelled; nothing was changed.', error: false } });
  } else if (verb === 'apply') {
    const p = pending.get(arg ?? '');
    if (!p) return void usePackageStore.setState({ message: { text: 'That change was already applied or cancelled.', error: true } });
    pending.delete(arg!);
    // The package moved on since the change was planned: do not overwrite newer edits.
    if (store.pkg !== p.base) return void usePackageStore.setState({ message: { text: 'The package changed since this was proposed. Ask again so it is planned against the current pages.', error: true } });
    store.applyPackage(p.next, p.summary);
    openStudio(p.openPageId);
  }
}
