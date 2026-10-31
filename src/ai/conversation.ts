/**
 * The assistant conversation: request → provider → resolve and compile → isolated dry run →
 * preview → approval → atomic commit. Framework-free; the editor is reached through `EditorPort`,
 * so the same code runs in the app (via the Zustand assistant store) and in integration tests.
 *
 * Context rules: "it" is the conversation's focus (what the last proposal created or changed);
 * "the previous one" is the focus before that. A follow-up about something a pending, not yet
 * applied proposal creates ("make it 750 mm high") is merged into that proposal. A proposal made
 * against an older revision is re-run on the current project and must be approved again.
 */
import { executeBatch, type DesignCommand, type KitchenProject, type WallId } from '@/domain';
import { diffProjects } from './diff';
import { findEntity } from './entities';
import { evaluate } from './layout/constraints';
import { PlanCancelled, planLayouts, resolveObjective, signature, type PlanOptions, type PlanResult } from './layout/planner';
import { canAutoApply, type AssistantSettings } from './policy';
import { ProviderError, type AssistantProvider, type ServedBy } from './providers/types';
import { resolveTarget } from './resolve';
import { DesignObjectiveSchema, LIMITS, type AssistantResponse, type DeliverableRequest, type DesignObjective, type HistoryTurn, type Plan, type Show, type TargetRef } from './schema';
import { bind, focusAfter, runPlan, type Alternative, type Proposal, type RunContext } from './transaction';

export interface EditorPort {
  getProject(): KitchenProject | null;
  getRevision(): number;
  getSelectedId(): string | null;
  /** Commits all commands as one undoable step, or nothing. */
  applyTransaction(commands: DesignCommand[], label: string, expectedRevision: number): { success: true; revision: number } | { success: false; errors: string[]; stale?: boolean };
  undo(steps: number): string[];
  redo(steps: number): string[];
  select(id: string | null): void;
  fmt(mm: number): string;
  /** Computes a deliverable summary from the project (drawings, schedule, BOM, readiness). */
  deliverable?(request: DeliverableRequest): DeliverableReply;
}

/** What the app computed for a deliverable request; actions are carried out by the UI. */
export interface DeliverableReply {
  title: string;
  lines: string[];
  table?: { columns: string[]; rows: string[][] };
  actions: { label: string; action: string }[];
  /** The design revision the reply describes. */
  revision: string;
}

/** How a request was entered. Voice and text share one pipeline; the source is only recorded. */
export type InputSource = 'text' | 'voice';

export interface SendOptions {
  source?: InputSource;
}

export type ProposalStatus = 'proposed' | 'applied' | 'rejected' | 'failed' | 'superseded';

export type ChatMessage =
  | { id: string; role: 'user'; text: string; source?: InputSource }
  | { id: string; role: 'assistant'; kind: 'answer'; text: string; show?: Show }
  | { id: string; role: 'assistant'; kind: 'clarify'; question: string; options: { label: string; ids?: string[] }[]; key?: string; proposal?: Proposal; answered?: boolean }
  | { id: string; role: 'assistant'; kind: 'proposal'; proposal: Proposal; status: ProposalStatus; note?: string; autoApplied?: boolean; appliedRevision?: number; error?: string }
  | { id: string; role: 'assistant'; kind: 'error'; text: string; code: string; retryable: boolean; retryText?: string }
  | { id: string; role: 'assistant'; kind: 'history'; text: string }
  | { id: string; role: 'assistant'; kind: 'deliverable'; request: DeliverableRequest; reply: DeliverableReply }
  | { id: string; role: 'assistant'; kind: 'layouts'; explanation: string; result: PlanResult; status: LayoutStatus; appliedId?: string; note?: string; error?: string };

/** Layout options: waiting for a choice, one applied, all rejected, replaced by newer options, or none valid. */
export type LayoutStatus = 'proposed' | 'applied' | 'rejected' | 'superseded' | 'failed';

export interface LogEntry {
  at: string;
  event: 'request' | 'response' | 'proposal' | 'applied' | 'rejected' | 'failed' | 'stale' | 'discarded' | 'error' | 'undo' | 'redo';
  detail: string;
  revision?: number;
  commands?: number;
}

export interface ConversationState {
  messages: ChatMessage[];
  busy: boolean;
  /** What the layout planner is doing, while it runs. */
  progress: string | null;
  focus: string[];
  previousFocus: string[];
  protect: { walls: WallId[]; ids: string[] };
  log: LogEntry[];
  provider: string;
  /** Who answered the last request (the server may substitute the built-in rules). */
  served: ServedBy | null;
}

export const initialConversation = (provider = 'rules'): ConversationState => ({ messages: [], busy: false, progress: null, focus: [], previousFocus: [], protect: { walls: [], ids: [] }, log: [], provider, served: null });

let counter = 0;
const msgId = () => `m${Date.now().toString(36)}${(++counter).toString(36)}`;

export class Conversation {
  state: ConversationState;
  private listeners = new Set<(s: ConversationState) => void>();
  private abort: AbortController | null = null;
  /** Changes on reset, so a reply to a request from a previous conversation is dropped. */
  private epoch = 0;

  constructor(
    private readonly editor: EditorPort,
    private provider: AssistantProvider,
    private settings: AssistantSettings,
    initial?: ConversationState,
  ) {
    this.state = initial ?? initialConversation(provider.id);
  }

  subscribe(fn: (s: ConversationState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setProvider(provider: AssistantProvider): void {
    this.provider = provider;
    this.update({ provider: provider.id, served: null });
  }

  setSettings(settings: AssistantSettings): void {
    this.settings = settings;
  }

  /** Forgets the conversation (e.g. when another project is opened). */
  reset(): void {
    this.epoch++;
    this.abort?.abort();
    this.state = initialConversation(this.provider.id);
    this.emit();
  }

  cancel(): void {
    this.abort?.abort();
  }

  /**
   * The one submission path for typed text, voice transcripts, examples and retries. Resolves with
   * the assistant's reply to this request (null when nothing was sent or the reply was discarded).
   * A reply that arrives after the conversation was reset or another project was opened is dropped,
   * and "the selected object" means what was selected when the request was made.
   */
  async send(raw: string, options: SendOptions = {}): Promise<ChatMessage | null> {
    const text = raw.trim();
    if (!text || this.state.busy) return null;
    const project = this.editor.getProject();
    if (!project) return null;
    const lastBefore = this.state.messages.at(-1)?.id;
    const reply = () => {
      const m = this.state.messages.at(-1);
      return m && m.role === 'assistant' && m.id !== lastBefore ? m : null;
    };
    if (text.length > LIMITS.messageChars) {
      this.push({ id: msgId(), role: 'assistant', kind: 'error', text: `Keep requests under ${LIMITS.messageChars} characters.`, code: 'bad_request', retryable: false });
      return reply();
    }
    this.push({ id: msgId(), role: 'user', text, ...(options.source === 'voice' ? { source: 'voice' as const } : {}) });

    if (/^(unlock|release (the )?locks?|forget (the )?locks?)$/i.test(text)) {
      this.update({ protect: { walls: [], ids: [] } });
      this.push({ id: msgId(), role: 'assistant', kind: 'answer', text: 'OK, nothing is locked any more.' });
      return reply();
    }
    // A typed answer to a pending clarification ("the first one", "the one on the left wall").
    if (this.answerClarification(text)) return reply();
    // "Apply option two" picks from the pending layout options (typed or spoken).
    const pick = /^(?:apply|choose|use|go with|pick|select)\s+(?:the\s+)?(?:option|layout|alternative)\s+(\d|one|two|three|four|five)$/i.exec(text.replace(/[.!]$/, ''));
    const pendingLayouts = this.pendingLayoutsId();
    if (pick && pendingLayouts) {
      const n = Number(pick[1]) || ['one', 'two', 'three', 'four', 'five'].indexOf(pick[1]!.toLowerCase()) + 1;
      const m = this.layoutsMessage(pendingLayouts)!;
      const c = m.result.candidates[n - 1];
      if (!c) {
        this.push({ id: msgId(), role: 'assistant', kind: 'answer', text: `There ${m.result.candidates.length === 1 ? 'is only 1 option' : `are only ${m.result.candidates.length} options`}.` });
        return reply();
      }
      const ok = await this.applyLayout(m.id, c.id);
      if (ok) this.push({ id: msgId(), role: 'assistant', kind: 'history', text: `Applied option ${n}: ${c.name}. Undo reverts the whole layout change.` });
      return reply();
    }

    const history = this.historyTurns();
    const revision = this.editor.getRevision();
    const selectedId = this.editor.getSelectedId();
    const epoch = this.epoch;
    const abort = new AbortController();
    this.abort = abort;
    this.update({ busy: true });
    this.logEvent('request', `${options.source ?? 'text'}, ${text.length} characters`, revision);
    const stale = () => epoch !== this.epoch || this.editor.getProject()?.id !== project.id;
    let response: AssistantResponse;
    try {
      response = await this.provider.respond(
        {
          message: text,
          history,
          context: { selectedId, focus: this.state.focus, previousFocus: this.state.previousFocus, protect: this.state.protect, revision },
          project,
        },
        abort.signal,
      );
    } catch (e) {
      if (stale()) return null;
      const pe = e instanceof ProviderError ? e : new ProviderError('provider_error', e instanceof Error ? e.message : 'The assistant failed.', true);
      const cancelled = abort.signal.aborted;
      this.logEvent('error', cancelled ? 'cancelled' : pe.code);
      this.push({ id: msgId(), role: 'assistant', kind: 'error', text: cancelled ? 'Cancelled.' : errorText(pe), code: cancelled ? 'cancelled' : pe.code, retryable: !cancelled && pe.retryable, retryText: text });
      this.update({ busy: false });
      this.abort = null;
      return reply();
    }
    if (stale()) {
      // The project was switched or the conversation reset while waiting: never apply this reply.
      this.logEvent('discarded', 'reply arrived after the project or conversation changed');
      return null;
    }
    this.logEvent('response', response.kind);
    this.update({ served: this.provider.lastServed ?? { provider: this.provider.id, model: this.provider.model } });
    if (response.kind === 'design') {
      // Planning runs on isolated copies; it keeps the request's abort signal and staleness check.
      await this.design(response, { selectedId, signal: abort.signal, stale });
      if (stale()) return null;
      this.abort = null;
      this.update({ busy: false });
      return reply();
    }
    this.abort = null;
    this.update({ busy: false });
    this.handle(response, selectedId);
    return reply();
  }

  /** Runs the layout planner for a goal (or a refinement of the last options) and shows the options. */
  private async design(response: Extract<AssistantResponse, { kind: 'design' }>, req: { selectedId: string | null; signal: AbortSignal; stale: () => boolean }, note?: string): Promise<void> {
    const last = this.latestLayouts();
    let objective: DesignObjective = response.objective;
    let only: PlanOptions['only'];
    let exclude: string[] = [];
    if (response.refine && last) {
      objective = mergeObjective(last.result.objective, response.objective);
      if (response.refine.option !== undefined) {
        const chosen = last.result.candidates[response.refine.option - 1];
        if (!chosen) {
          this.push({ id: msgId(), role: 'assistant', kind: 'answer', text: `There ${last.result.candidates.length === 1 ? 'is only 1 option' : `are only ${last.result.candidates.length} options`} to choose from.` });
          return;
        }
        only = { generator: chosen.recipe.generator, topology: chosen.recipe.topology, walls: chosen.recipe.walls };
      }
      if (response.refine.another) exclude = last.result.candidates.map((c) => signature(c.after));
    }
    const project = this.editor.getProject()!;
    const revision = this.editor.getRevision();
    this.update({ progress: 'Reading the project…' });
    let outcome: Awaited<ReturnType<typeof planLayouts>>;
    try {
      outcome = await planLayouts(project, objective, {
        revision,
        selectedId: req.selectedId,
        focus: this.state.focus,
        previousFocus: this.state.previousFocus,
        signal: req.signal,
        onProgress: (p) => {
          if (!req.stale()) this.update({ progress: `${p.step}…` });
        },
        exclude,
        only,
      });
    } catch (e) {
      if (req.stale()) return;
      this.update({ progress: null });
      if (e instanceof PlanCancelled) {
        this.logEvent('error', 'layout planning cancelled');
        this.push({ id: msgId(), role: 'assistant', kind: 'error', text: 'Cancelled. Nothing was changed.', code: 'cancelled', retryable: false });
        return;
      }
      throw e;
    }
    if (req.stale()) {
      this.logEvent('discarded', 'layout options arrived after the project or conversation changed');
      return;
    }
    this.update({ progress: null });
    if (outcome.kind === 'question') {
      this.push({ id: msgId(), role: 'assistant', kind: 'clarify', question: outcome.question, options: outcome.options.map((label) => ({ label })) });
      return;
    }
    if (last && last.status === 'proposed') this.setMessage(last.id, { status: 'superseded', note: 'Replaced by the options below.' });
    const r = outcome.result;
    this.logEvent('proposal', `layouts: ${r.candidates.length} valid of ${r.stats.generated} generated (${r.stats.evaluated} checks, ${r.stats.ms} ms)`, revision, r.candidates.length);
    this.push({ id: msgId(), role: 'assistant', kind: 'layouts', explanation: response.explanation, result: r, status: r.candidates.length ? 'proposed' : 'failed', note });
  }

  /**
   * Applies one layout option atomically. If the project changed since the options were made, they
   * are generated again instead; otherwise the option is re-validated on the current design first.
   */
  async applyLayout(messageId: string, candidateId: string): Promise<boolean> {
    const m = this.layoutsMessage(messageId);
    if (!m || m.status !== 'proposed' || this.state.busy) return false;
    const c = m.result.candidates.find((x) => x.id === candidateId);
    if (!c) return false;
    const project = this.editor.getProject();
    if (!project) return false;
    if (m.result.baseRevision !== this.editor.getRevision()) {
      this.logEvent('stale', 'layout options are older than the design', this.editor.getRevision());
      this.setMessage(messageId, { status: 'superseded', note: 'The design changed since these options were made, so they were generated again below.' });
      await this.regenerate(m);
      return false;
    }
    const resolved = resolveObjective(project, m.result.objective, { selectedId: this.editor.getSelectedId(), focus: this.state.focus, previousFocus: this.state.previousFocus });
    const run = executeBatch(project, c.commands);
    const hard = resolved.ok && run.success ? evaluate(project, run.project, diffProjects(project, run.project, new Set()), resolved.resolved).hard : [];
    if (!resolved.ok || !run.success || hard.length) {
      const why = !resolved.ok ? resolved.question : !run.success ? (run.results.at(-1)?.errors.join(' ') ?? 'Rejected.') : hard.map((h) => h.message).join(' ');
      this.setMessage(messageId, { error: `This option no longer passes the checks: ${why}` });
      this.logEvent('failed', why);
      return false;
    }
    const result = this.editor.applyTransaction(c.commands, `Layout: ${c.name}`, m.result.baseRevision);
    if (!result.success) {
      this.setMessage(messageId, { error: result.errors.join(' ') });
      this.logEvent('failed', result.errors.join(' '), this.editor.getRevision());
      return false;
    }
    this.logEvent('applied', `layout ${c.name}`, result.revision, c.commands.length);
    this.setMessage(messageId, { status: 'applied', appliedId: c.id, error: undefined });
    return true;
  }

  rejectLayouts(messageId: string): void {
    const m = this.layoutsMessage(messageId);
    if (!m || m.status !== 'proposed') return;
    this.logEvent('rejected', `layout options: ${m.explanation}`);
    this.setMessage(messageId, { status: 'rejected' });
  }

  /** Generates layout options again from the same goal against the current design. */
  async regenerate(m: Extract<ChatMessage, { kind: 'layouts' }>): Promise<void> {
    if (this.state.busy) return;
    const epoch = this.epoch;
    const projectId = this.editor.getProject()?.id;
    const abort = new AbortController();
    this.abort = abort;
    this.update({ busy: true });
    const stale = () => epoch !== this.epoch || this.editor.getProject()?.id !== projectId;
    await this.design({ kind: 'design', explanation: m.explanation, objective: m.result.objective }, { selectedId: this.editor.getSelectedId(), signal: abort.signal, stale }, 'Generated again against the current design.');
    if (stale()) return;
    this.abort = null;
    this.update({ busy: false });
  }

  /** The newest layout-options message waiting for a choice. */
  pendingLayoutsId(): string | null {
    const m = this.latestLayouts();
    return m && m.status === 'proposed' ? m.id : null;
  }

  private latestLayouts(): Extract<ChatMessage, { kind: 'layouts' }> | null {
    for (let i = this.state.messages.length - 1; i >= 0; i--) {
      const m = this.state.messages[i]!;
      if (m.role === 'assistant' && m.kind === 'layouts') return m;
    }
    return null;
  }

  private layoutsMessage(id: string): Extract<ChatMessage, { kind: 'layouts' }> | null {
    const m = this.state.messages.find((x) => x.id === id);
    return m && m.role === 'assistant' && m.kind === 'layouts' ? m : null;
  }

  /** The proposal waiting for approval, if any (for spoken "apply" / "reject"). */
  pendingProposalId(): string | null {
    return this.latestPending()?.id ?? null;
  }

  private handle(response: AssistantResponse, requestSelectedId: string | null): void {
    switch (response.kind) {
      case 'answer': {
        if (response.protect) this.addProtection(response.protect);
        this.push({ id: msgId(), role: 'assistant', kind: 'answer', text: response.text, show: response.show });
        return;
      }
      case 'clarify':
        this.push({ id: msgId(), role: 'assistant', kind: 'clarify', question: response.question, options: response.options.map((label) => ({ label })) });
        return;
      case 'history': {
        const labels = response.action === 'undo' ? this.editor.undo(response.steps) : this.editor.redo(response.steps);
        this.logEvent(response.action, labels.join('; ') || 'nothing', this.editor.getRevision());
        const verb = response.action === 'undo' ? 'Undid' : 'Redid';
        this.push({ id: msgId(), role: 'assistant', kind: 'history', text: labels.length ? `${verb}: ${labels.join('; ')}.` : `There is nothing to ${response.action}.` });
        return;
      }
      case 'plan':
        if (response.protect) this.addProtection(response.protect);
        this.propose(response, requestSelectedId);
        return;
      case 'design':
        return;
      case 'deliverable': {
        if (!this.editor.deliverable) {
          this.push({ id: msgId(), role: 'assistant', kind: 'answer', text: 'Deliverables are not available here.' });
          return;
        }
        const reply = this.editor.deliverable(response.request);
        this.logEvent('response', `deliverable ${response.request.action}`);
        this.push({ id: msgId(), role: 'assistant', kind: 'deliverable', request: response.request, reply });
      }
    }
  }

  private runContext(extra: Partial<RunContext> = {}): RunContext {
    return {
      selectedId: this.editor.getSelectedId(),
      focus: this.state.focus,
      previousFocus: this.state.previousFocus,
      protect: this.state.protect,
      revision: this.editor.getRevision(),
      fmt: (mm) => this.editor.fmt(mm),
      ...extra,
    };
  }

  private propose(plan: Plan, requestSelectedId: string | null): void {
    const project = this.editor.getProject()!;
    // "This" / "the selected one" means what was selected when the request was made.
    const selected = { selectedId: requestSelectedId };
    const selectionMoved = requestSelectedId !== this.editor.getSelectedId() && JSON.stringify(plan.operations).includes('"ref":"selected"');
    const pending = this.latestPending();
    // Follow-up on something only a pending proposal creates: extend that proposal instead.
    const pendingCreated = pending?.proposal.created ?? [];
    const aboutPending = pendingCreated.length > 0 && this.state.focus.some((id) => pendingCreated.includes(id) && !findEntity(project, id)) && JSON.stringify(plan.operations).includes('"ref":"it"');
    let proposal: Proposal;
    if (pending && aboutPending) {
      proposal = runPlan(project, { explanation: `${pending.proposal.explanation} ${plan.explanation}`, operations: [...pending.proposal.operations, ...plan.operations] }, this.runContext({ ...selected, reuseIds: pendingCreated, bindings: pending.proposal.bindings }));
      this.setMessage(pending.id, { status: 'superseded', note: 'Combined with your follow-up below.' });
    } else {
      proposal = runPlan(project, plan, this.runContext(selected));
    }
    const was = requestSelectedId ? findEntity(project, requestSelectedId)?.label : null;
    this.present(proposal, selectionMoved && was ? `“Selected” means the ${was}, which was selected when you asked.` : undefined);
  }

  private present(proposal: Proposal, note?: string): void {
    if (proposal.status === 'needs_clarification' && proposal.clarification) {
      const c = proposal.clarification;
      this.push({ id: msgId(), role: 'assistant', kind: 'clarify', question: c.question, options: c.candidates.map((x) => ({ label: x.label, ids: [x.id] })), key: c.key, proposal });
      return;
    }
    const focus = focusAfter(proposal);
    if (focus.length && proposal.status === 'valid') this.setFocus(focus);
    const id = msgId();
    this.logEvent('proposal', `${proposal.status}: ${proposal.operations.map((o) => o.op).join(', ')}${proposal.errors.length ? ` — ${proposal.errors[0]}` : ''}`, proposal.baseRevision, proposal.commands.length);
    this.push({ id, role: 'assistant', kind: 'proposal', proposal, status: proposal.status === 'valid' ? 'proposed' : 'failed', note });
    if (proposal.status === 'valid' && canAutoApply(proposal, this.settings)) this.approve(id, true);
  }

  /** Commits a proposal atomically; re-runs it first if the project changed since the preview. */
  approve(messageId: string, auto = false): void {
    const msg = this.proposalMessage(messageId);
    if (!msg || msg.status !== 'proposed') return;
    const p = msg.proposal;
    if (p.baseRevision !== this.editor.getRevision()) {
      this.logEvent('stale', 'project changed since the preview', this.editor.getRevision());
      this.setMessage(messageId, { status: 'superseded', note: 'The project changed since this preview.' });
      this.present(this.rerun(p), 'The project changed since the previous preview, so I re-checked this change against the current design. Review it and apply again.');
      return;
    }
    const label = `Assistant: ${p.steps.flatMap((s) => s.summaries).join('; ')}`.slice(0, 200);
    const result = this.editor.applyTransaction(p.commands, label, p.baseRevision);
    if (!result.success) {
      this.logEvent('failed', result.errors.join(' '), this.editor.getRevision());
      this.setMessage(messageId, { status: 'failed', error: result.errors.join(' ') });
      return;
    }
    this.logEvent('applied', label, result.revision, p.commands.length);
    this.setMessage(messageId, { status: 'applied', appliedRevision: result.revision, autoApplied: auto });
    const focus = focusAfter(p).filter((id) => findEntity(this.editor.getProject()!, id));
    if (focus.length === 1) this.editor.select(focus[0]!);
  }

  reject(messageId: string): void {
    const msg = this.proposalMessage(messageId);
    if (!msg || msg.status !== 'proposed') return;
    this.logEvent('rejected', msg.proposal.explanation);
    this.setMessage(messageId, { status: 'rejected' });
    // Forget what the rejected proposal would have created.
    if (msg.proposal.created.length && this.state.focus.every((id) => msg.proposal.created.includes(id))) this.update({ focus: this.state.previousFocus, previousFocus: [] });
  }

  /** Re-checks a proposal against the current project (after outside edits). */
  refresh(messageId: string): void {
    const msg = this.proposalMessage(messageId);
    if (!msg) return;
    this.setMessage(messageId, { status: 'superseded' });
    this.present(this.rerun(msg.proposal), 'Re-checked against the current design.');
  }

  /** Proposes one of the verified alternatives offered for a failed proposal. */
  useAlternative(messageId: string, index: number): void {
    const msg = this.proposalMessage(messageId);
    if (!msg) return;
    const alt: Alternative | undefined = msg.proposal.alternatives[index];
    if (!alt) return;
    this.push({ id: msgId(), role: 'user', text: alt.label });
    this.present(runPlan(this.editor.getProject()!, { explanation: `${msg.proposal.explanation} (${alt.label.charAt(0).toLowerCase()}${alt.label.slice(1)})`, operations: alt.operations }, this.runContext({ bindings: msg.proposal.bindings })));
  }

  /** Answers a clarification by choosing one of its options. */
  choose(messageId: string, optionIndex: number): void {
    const msg = this.clarifyMessage(messageId);
    if (!msg || msg.answered) return;
    const option = msg.options[optionIndex];
    if (!option) return;
    this.setMessage(messageId, { answered: true });
    if (option.ids && msg.key && msg.proposal) {
      this.push({ id: msgId(), role: 'user', text: option.label });
      this.present(bind(msg.proposal, msg.key, option.ids, this.editor.getProject()!, this.runContext()));
      return;
    }
    void this.send(option.label);
  }

  private answerClarification(text: string): boolean {
    const last = this.state.messages.at(-2);
    if (!last || last.role !== 'assistant' || last.kind !== 'clarify' || last.answered || !last.key || !last.proposal) return false;
    const t = text.toLowerCase();
    const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
    let matches = last.options.filter((o, i) => new RegExp(`\\b(${ordinals[i]}|#?${i + 1})\\b`).test(t) || o.label.toLowerCase() === t);
    if (!matches.length) {
      const words = t.split(/\W+/).filter((w) => w.length > 2 && !['the', 'one', 'that', 'wall', 'mm', 'cabinet', 'unit'].includes(w));
      matches = last.options.filter((o) => words.length > 0 && words.every((w) => o.label.toLowerCase().includes(w)));
    }
    if (matches.length !== 1 || !matches[0]!.ids) return false;
    this.setMessage(last.id, { answered: true });
    this.present(bind(last.proposal, last.key, matches[0]!.ids, this.editor.getProject()!, this.runContext()));
    return true;
  }

  private rerun(p: Proposal): Proposal {
    return runPlan(this.editor.getProject()!, { explanation: p.explanation, operations: p.operations }, this.runContext({ reuseIds: p.created, bindings: p.bindings }));
  }

  private addProtection(protect: { walls: WallId[]; targets: TargetRef[] }): void {
    const project = this.editor.getProject()!;
    const ids = [...this.state.protect.ids];
    for (const t of protect.targets) {
      const r = resolveTarget(project, t, { selectedId: this.editor.getSelectedId(), focus: this.state.focus, previousFocus: this.state.previousFocus, created: new Map(), bindings: {} }, 'protect', true);
      if (r.ok) ids.push(...r.entities.map((e) => e.id));
    }
    this.update({ protect: { walls: [...new Set([...this.state.protect.walls, ...protect.walls])], ids: [...new Set(ids)] } });
  }

  private setFocus(ids: string[]): void {
    if (JSON.stringify(ids) === JSON.stringify(this.state.focus)) return;
    this.update({ previousFocus: this.state.focus, focus: ids });
  }

  private latestPending(): Extract<ChatMessage, { kind: 'proposal' }> | null {
    for (let i = this.state.messages.length - 1; i >= 0; i--) {
      const m = this.state.messages[i]!;
      if (m.role === 'assistant' && m.kind === 'proposal') return m.status === 'proposed' ? m : null;
    }
    return null;
  }

  private historyTurns(): HistoryTurn[] {
    const turns: HistoryTurn[] = this.state.messages.slice(-LIMITS.historyTurns).map((m): HistoryTurn => {
      if (m.role === 'user') return { role: 'user', text: m.text };
      const text =
        m.kind === 'answer' ? m.text
        : m.kind === 'clarify' ? m.question
        : m.kind === 'history' ? m.text
        : m.kind === 'error' ? `(error: ${m.text})`
        : m.kind === 'deliverable' ? `(${m.reply.title}: ${m.reply.lines.slice(0, 3).join(' ')})`
        : m.kind === 'layouts' ? `(layout options ${m.status}: ${m.result.candidates.map((c, i) => `${i + 1}. ${c.name}`).join('; ') || m.result.infeasible.join(' ')})`
        : `(proposal ${m.status}) ${m.proposal.explanation}${m.proposal.errors.length ? ` — rejected: ${m.proposal.errors[0]}` : ''}`;
      return { role: 'assistant', text: text.slice(0, LIMITS.historyChars) };
    });
    // The current message is sent separately.
    if (turns.at(-1)?.role === 'user') turns.pop();
    return turns;
  }

  private proposalMessage(id: string): Extract<ChatMessage, { kind: 'proposal' }> | null {
    const m = this.state.messages.find((x) => x.id === id);
    return m && m.role === 'assistant' && m.kind === 'proposal' ? m : null;
  }

  private clarifyMessage(id: string): Extract<ChatMessage, { kind: 'clarify' }> | null {
    const m = this.state.messages.find((x) => x.id === id);
    return m && m.role === 'assistant' && m.kind === 'clarify' ? m : null;
  }

  private setMessage(id: string, patch: Record<string, unknown>): void {
    this.update({ messages: this.state.messages.map((m) => (m.id === id ? ({ ...m, ...patch } as ChatMessage) : m)) });
  }

  private push(m: ChatMessage): void {
    this.update({ messages: [...this.state.messages, m].slice(-200) });
  }

  private logEvent(event: LogEntry['event'], detail: string, revision?: number, commands?: number): void {
    this.update({ log: [...this.state.log, { at: new Date().toISOString(), event, detail: detail.slice(0, 300), revision, commands }].slice(-200) });
  }

  private update(patch: Partial<ConversationState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }
}

/** A refinement keeps the previous goal and adds what the designer said now. */
export function mergeObjective(prev: DesignObjective, next: DesignObjective): DesignObjective {
  const defaults = DesignObjectiveSchema.parse({ goal: next.goal });
  const changed = <K extends keyof DesignObjective>(k: K) => JSON.stringify(next[k]) !== JSON.stringify(defaults[k]);
  const merged: DesignObjective = { ...prev, goal: next.goal };
  for (const k of Object.keys(next) as (keyof DesignObjective)[]) {
    if (k === 'goal' || !changed(k)) continue;
    const pv = prev[k];
    const nv = next[k];
    (merged as Record<string, unknown>)[k] = Array.isArray(pv) && Array.isArray(nv) ? [...new Map([...nv, ...pv].map((x) => [JSON.stringify(x), x])).values()] : nv;
  }
  return merged;
}

function errorText(e: ProviderError): string {
  switch (e.code) {
    case 'rate_limited':
      return `${e.message}${e.retryAfterSeconds ? ` (about ${e.retryAfterSeconds} s)` : ''}`;
    case 'timeout':
      return e.message;
    case 'malformed_output':
      return `${e.message} Nothing was changed.`;
    default:
      return e.message;
  }
}

/** Whether a proposal message still needs the designer's decision. */
export const isPending = (m: ChatMessage) => m.role === 'assistant' && m.kind === 'proposal' && m.status === 'proposed';

