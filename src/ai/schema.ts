/**
 * The assistant's contract. A model (or the built-in rule-based provider) never edits the project:
 * it returns an `AssistantResponse`, parsed here with Zod. Plans are high-level `AssistantOperation`s
 * with references ("it", "the sink", an id) and lengths in any unit; `compile.ts` resolves them
 * against the actual project and turns them into ordinary `DesignCommand`s in whole millimetres.
 */
import { z } from 'zod';
import {
  ApplianceTypeSchema,
  CabinetTypeSchema,
  FrontStyleSchema,
  FurnitureTypeSchema,
  KitchenProjectSchema,
  OpeningKindSchema,
  SurfaceSchema,
  WallIdSchema,
} from '@/domain';
import { LENGTH_UNITS } from '@/engine/measurement/units';
import { AiSelectionSchema } from './providers/catalog';

/** Hard limits applied on the client and again on the server. */
export const LIMITS = {
  messageChars: 1000,
  historyTurns: 12,
  historyChars: 2000,
  operations: 20,
  /** Most entities one "all …" reference may select. */
  targets: 60,
  projectBytes: 1_000_000,
} as const;

/**
 * A length: a number is millimetres; a string is parsed like a length field ("12 ft", "750 mm",
 * "3' 6\""); or an explicit value and unit. Converted once to whole millimetres before execution.
 */
export const LengthSchema = z.union([
  z.number().finite(),
  z.string().trim().min(1).max(40),
  z.object({ value: z.number().finite(), unit: z.enum(LENGTH_UNITS) }),
]);
export type LengthInput = z.infer<typeof LengthSchema>;

export const EntityKindSchema = z.enum(['cabinet', 'appliance', 'furniture', 'opening', 'wall', 'any']);
export type EntityKind = z.infer<typeof EntityKindSchema>;

const QueryBase = z.object({
  kind: EntityKindSchema.optional(),
  /** Cabinet, appliance or furniture type, or opening kind ("sink", "fridge", "window"). */
  type: z.string().trim().max(30).optional(),
  wall: WallIdSchema.optional(),
  /** Only units standing free of the walls (islands). */
  freeStanding: z.boolean().optional(),
  /** Walls only: the wall that has an opening of this kind ("the window wall"). */
  hasOpening: OpeningKindSchema.optional(),
  /** Only entities of this width (mm). */
  width: z.number().int().positive().optional(),
  /** Pick by position as seen standing in the room facing the wall. */
  extreme: z.enum(['leftmost', 'rightmost', 'highest', 'lowest']).optional(),
  /** 1-based position along the wall run (after other filters). */
  nth: z.number().int().min(1).max(60).optional(),
  /** Every match, for edits such as "all base cabinets". */
  all: z.boolean().optional(),
});

/**
 * Which entity an operation acts on. Resolved deterministically against the project; when a
 * single-target reference matches several entities the assistant asks which one instead of guessing.
 */
export type TargetRef =
  | { id: string }
  | { ref: 'selected' | 'it' | 'previous' }
  | { created: number }
  | { query: z.infer<typeof QueryBase> & { nextTo?: TargetRef; side?: 'left' | 'right' } };

export const TargetSchema: z.ZodType<TargetRef> = z.lazy(() =>
  z.union([
    z.object({ id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, 'invalid id') }).strict(),
    /** selected = the selected object; it = the object the conversation is about; previous = the one before. */
    z.object({ ref: z.enum(['selected', 'it', 'previous']) }).strict(),
    /** An entity created earlier in the same plan, by operation index. */
    z.object({ created: z.number().int().min(0).max(LIMITS.operations) }).strict(),
    z.object({ query: QueryBase.extend({ nextTo: TargetSchema.optional(), side: z.enum(['left', 'right']).optional() }).strict() }).strict(),
  ]),
);

/**
 * Directions. left/right/forward/backward are as seen standing in front of the object, facing it
 * (its own −x/+x, towards you/away from you); up/down change the height of wall-hung units; the
 * towards_*_wall directions use the room's axes regardless of how the object faces.
 */
export const DirectionSchema = z.enum([
  'left',
  'right',
  'forward',
  'backward',
  'up',
  'down',
  'towards_left_wall',
  'towards_right_wall',
  'towards_back_wall',
  'towards_front_wall',
]);
export type Direction = z.infer<typeof DirectionSchema>;

/**
 * Where a new or moved element goes:
 * - on a wall, `offset` from the wall's start (the left wall for back/front walls, the back wall for
 *   left/right walls) to the element's nearest edge;
 * - beside another element on the same wall (`side` as seen facing it; `auto` tries right, then left);
 * - free-standing, its edges `fromLeftWall` and `fromBackWall` away from those walls;
 * - `near`: beside the element if there is room, otherwise the first free spot on any wall.
 */
export const PlacementSchema = z.union([
  z.object({ wall: WallIdSchema, offset: LengthSchema.optional(), elevation: LengthSchema.optional() }).strict(),
  z.object({ nextTo: TargetSchema, side: z.enum(['left', 'right', 'auto']).default('auto') }).strict(),
  z.object({ fromLeftWall: LengthSchema, fromBackWall: LengthSchema }).strict(),
  z.object({ near: TargetSchema }).strict(),
]);
export type PlacementInput = z.infer<typeof PlacementSchema>;

const finish = z.string().trim().min(1).max(60);

export const OperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create_cabinet'), cabinetType: CabinetTypeSchema, width: LengthSchema.optional(), height: LengthSchema.optional(), depth: LengthSchema.optional(), finish: finish.optional(), placement: PlacementSchema.optional() }).strict(),
  z.object({ op: z.literal('create_appliance'), applianceType: ApplianceTypeSchema, width: LengthSchema.optional(), placement: PlacementSchema.optional() }).strict(),
  z.object({ op: z.literal('create_furniture'), furnitureType: FurnitureTypeSchema, width: LengthSchema.optional(), height: LengthSchema.optional(), depth: LengthSchema.optional(), finish: finish.optional(), placement: PlacementSchema.optional() }).strict(),
  z.object({ op: z.literal('create_opening'), kind: OpeningKindSchema, wall: WallIdSchema.optional(), offset: LengthSchema.optional(), width: LengthSchema.optional(), height: LengthSchema.optional(), sill: LengthSchema.optional() }).strict(),
  /** Absolute new sizes. Elements, openings (width/height) and walls (length = width, height). */
  z.object({ op: z.literal('resize'), target: TargetSchema, width: LengthSchema.optional(), height: LengthSchema.optional(), depth: LengthSchema.optional() }).strict(),
  /** Relative size change, e.g. "100 mm wider". */
  z.object({ op: z.literal('resize_by'), target: TargetSchema, width: LengthSchema.optional(), height: LengthSchema.optional(), depth: LengthSchema.optional() }).strict(),
  z.object({ op: z.literal('move_by'), target: TargetSchema, distance: LengthSchema, direction: DirectionSchema }).strict(),
  z.object({ op: z.literal('move_to'), target: TargetSchema, placement: PlacementSchema }).strict(),
  /** Turn by a quarter-turn multiple (positive = anticlockwise seen from above). Floor units only. */
  z.object({ op: z.literal('rotate'), target: TargetSchema, degrees: z.union([z.literal(90), z.literal(180), z.literal(270), z.literal(-90)]) }).strict(),
  z.object({ op: z.literal('delete'), target: TargetSchema }).strict(),
  z.object({ op: z.literal('set_finish'), target: TargetSchema, finish }).strict(),
  z.object({ op: z.literal('set_surface_finish'), surface: SurfaceSchema, finish }).strict(),
  z.object({ op: z.literal('set_front_style'), target: TargetSchema, style: FrontStyleSchema }).strict(),
  z.object({ op: z.literal('set_room'), width: LengthSchema.optional(), length: LengthSchema.optional(), height: LengthSchema.optional(), wallThickness: LengthSchema.optional() }).strict(),
  z.object({ op: z.literal('update_opening'), target: TargetSchema, swing: z.enum(['in', 'out', 'none']).optional(), hinge: z.enum(['left', 'right']).optional(), sill: LengthSchema.optional() }).strict(),
  z.object({ op: z.literal('set_units'), unit: z.enum(LENGTH_UNITS) }).strict(),
  z.object({ op: z.literal('rename_project'), name: z.string().trim().min(1).max(120) }).strict(),
]);
export type AssistantOperation = z.infer<typeof OperationSchema>;

/** Things the designer asked to keep unchanged ("keep the window wall as it is"). */
export const ProtectSchema = z.object({
  walls: z.array(WallIdSchema).max(4).default([]),
  targets: z.array(TargetSchema).max(20).default([]),
});

/** What the answer should show from the real project (rendered from data, never from model text). */
export const ShowSchema = z.enum(['elements', 'cabinets', 'appliances', 'furniture', 'openings', 'walls', 'room', 'selection', 'issues']);
export type Show = z.infer<typeof ShowSchema>;

export const PlanSchema = z.object({
  kind: z.literal('plan'),
  /** One or two sentences, in the designer's terms, of what will change. */
  explanation: z.string().trim().min(1).max(600),
  operations: z.array(OperationSchema).min(1).max(LIMITS.operations),
  protect: ProtectSchema.optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

/** Kitchen topologies the layout planner can produce. "keep" = the current one. */
export const TopologySchema = z.enum(['keep', 'straight', 'l-shaped', 'u-shaped', 'galley']);
export type Topology = z.infer<typeof TopologySchema>;

export const PrioritySchema = z.enum(['storage', 'counter', 'workflow', 'budget', 'accessibility']);
export type Priority = z.infer<typeof PrioritySchema>;

/**
 * A layout goal ("convert this L into a U, keep the sink wall, maximise storage"), as structured
 * data. Only what the designer said: measurements come from the project or from the designer
 * (`roomSize`, `minWalkway`), never from the model. Everything is checked by the deterministic
 * constraint engine in `src/ai/layout`.
 */
export const DesignObjectiveSchema = z
  .object({
    goal: z.string().trim().min(1).max(300),
    topology: TopologySchema.default('keep'),
    /** Keep every sink on the wall it is on now (e.g. the plumbing wall). */
    keepSinkWall: z.boolean().default(false),
    /** Objects that must stay exactly as they are. */
    preserve: z.array(TargetSchema).max(30).default([]),
    /** Keep every appliance exactly where it is. */
    preserveAppliances: z.boolean().default(false),
    /** Walls whose units and openings must not change. */
    preserveWalls: z.array(WallIdSchema).max(4).default([]),
    /** Which units may change at all. */
    scope: z.enum(['all', 'upper-only', 'base-only']).default('all'),
    /** Ranking preferences, most important first. */
    priorities: z.array(PrioritySchema).max(5).default([]),
    /** A walkway the designer requires (hard constraint). Defaults to the configured guidance. */
    minWalkway: LengthSchema.optional(),
    /** Door/drawer clearance and walkway guidance: must hold (hard) or only ranks options (soft). */
    clearances: z.enum(['hard', 'soft']).default('hard'),
    /** Move something towards the entrance (a door) or another fixture. */
    moveNear: z.object({ target: TargetSchema, to: z.enum(['entrance', 'sink', 'range', 'fridge']) }).strict().optional(),
    /** Find and fix overlaps, out-of-room units, blocked openings and clearance clashes. */
    fixIssues: z.boolean().default(false),
    /** Room size given by the designer for a new layout. */
    roomSize: z.object({ width: LengthSchema, length: LengthSchema }).strict().optional(),
    /** Reposition free-standing units (islands). */
    repositionIsland: z.boolean().default(false),
    alternatives: z.number().int().min(1).max(5).default(3),
    budget: z.object({ amount: z.number().positive(), currency: z.string().trim().length(3) }).strict().optional(),
  })
  .strict();
export type DesignObjective = z.infer<typeof DesignObjectiveSchema>;
export type DesignObjectiveInput = z.input<typeof DesignObjectiveSchema>;

/** A follow-up on the last set of layout options. */
export const RefineSchema = z
  .object({
    /** 1-based option number the designer prefers ("option two"). */
    option: z.number().int().min(1).max(5).optional(),
    /** Ask for new options, not the ones already shown. */
    another: z.boolean().optional(),
  })
  .strict();

/** A request for drawings, schedules, BOM, readiness, exports or a presentation. */
export const DeliverableRequestSchema = z
  .object({
    action: z.enum(['plan', 'elevations', 'schedule', 'bom', 'readiness', 'export-pdf', 'export-csv', 'regenerate', 'present']),
    /** Elevations of these walls; with `kitchenWalls`, every wall that has units. */
    walls: z.array(WallIdSchema).max(4).optional(),
    kitchenWalls: z.boolean().optional(),
    /** Schedule filter, e.g. base cabinets. */
    filter: z.object({ type: z.string().trim().max(30).optional(), category: z.enum(['cabinet', 'appliance', 'furniture']).optional() }).strict().optional(),
    csv: z.enum(['schedule', 'bom', 'cutlist']).optional(),
    revision: z.enum(['current', 'approved']).default('current'),
  })
  .strict();
export type DeliverableRequest = z.infer<typeof DeliverableRequestSchema>;

export const AssistantResponseSchema = z.discriminatedUnion('kind', [
  PlanSchema,
  z.object({ kind: z.literal('clarify'), question: z.string().trim().min(1).max(400), options: z.array(z.string().trim().min(1).max(120)).max(6).default([]) }),
  z.object({ kind: z.literal('answer'), text: z.string().trim().min(1).max(1500), show: ShowSchema.optional(), protect: ProtectSchema.optional() }),
  z.object({ kind: z.literal('history'), action: z.enum(['undo', 'redo']), steps: z.number().int().min(1).max(10).default(1) }),
  /** A layout goal for the planner, optionally refining the last options. */
  z.object({ kind: z.literal('design'), explanation: z.string().trim().min(1).max(600), objective: DesignObjectiveSchema, refine: RefineSchema.optional() }),
  /** Deliverables are computed by the app; the model only says which. */
  z.object({ kind: z.literal('deliverable'), request: DeliverableRequestSchema }),
]);
export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;

/** Conversation state sent with every request so follow-ups ("make it taller") resolve. */
export const ConversationContextSchema = z.object({
  selectedId: z.string().max(64).nullable(),
  /** Entities the conversation is about now ("it", "that cabinet"). */
  focus: z.array(z.string().max(64)).max(LIMITS.targets),
  /** Entities discussed before the current focus ("the previous one"). */
  previousFocus: z.array(z.string().max(64)).max(LIMITS.targets),
  protect: z.object({ walls: z.array(WallIdSchema).max(4), ids: z.array(z.string().max(64)).max(LIMITS.targets) }),
  /** Editor revision the request was made against (stale-plan detection). */
  revision: z.number().int().nonnegative(),
});
export type ConversationContext = z.infer<typeof ConversationContextSchema>;

export const HistoryTurnSchema = z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(LIMITS.historyChars) });
export type HistoryTurn = z.infer<typeof HistoryTurnSchema>;

/** The request body for `/api/assistant` and the input every provider receives. */
export const AssistantRequestSchema = z.object({
  message: z.string().trim().min(1, 'Type a request.').max(LIMITS.messageChars, `Keep requests under ${LIMITS.messageChars} characters.`),
  history: z.array(HistoryTurnSchema).max(LIMITS.historyTurns),
  context: ConversationContextSchema,
  project: KitchenProjectSchema,
  /** Which AI provider and model to use; the server's default when absent. */
  ai: AiSelectionSchema.optional(),
});
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;

export const ProviderErrorCodeSchema = z.enum(['timeout', 'rate_limited', 'malformed_output', 'provider_error', 'unavailable', 'bad_request', 'refused']);
export type ProviderErrorCode = z.infer<typeof ProviderErrorCodeSchema>;

export const AssistantReplySchema = z.discriminatedUnion('ok', [
  /** `notice` explains a substitution, e.g. the chosen provider has no key so the built-in rules answered. */
  z.object({ ok: z.literal(true), provider: z.string(), model: z.string().optional(), notice: z.string().optional(), response: AssistantResponseSchema }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: ProviderErrorCodeSchema, message: z.string(), retryable: z.boolean(), retryAfterSeconds: z.number().optional() }),
  }),
]);
export type AssistantReply = z.infer<typeof AssistantReplySchema>;
