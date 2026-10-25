import type { Um } from './units';
import type { Lighting } from './lighting';

export const SCHEMA_VERSION = 7;

/** Where a dimension came from — an estimate must never be presented as a verified measurement. */
export type Provenance = 'site_measured' | 'drawing' | 'estimate';

/**
 * Plan coordinate system (top view): +x → east, +y → south (screen down), z → up from finished floor.
 * Integer micrometres throughout.
 */
export interface Pt {
  x: Um;
  y: Um;
}

/** A straight wall along its centreline. Walls meet where their endpoints coincide or touch another wall. */
export interface Wall {
  id: string;
  a: Pt;
  b: Pt;
  thicknessUm: Um;
  heightUm: Um;
  /**
   * Per-face finish (material ids). `pos` is side +1, `neg` side −1. Missing faces use the colour
   * of the room they face.
   */
  finishes?: { pos?: string; neg?: string };
}

/**
 * Side of a wall, relative to its direction a → b. The side's normal is `side * (−dy, dx) / |d|`,
 * so with y pointing down, +1 is the right-hand side when walking from a to b.
 */
export type WallSideSign = 1 | -1;

export interface Opening {
  id: string;
  kind: 'door' | 'window';
  wallId: string;
  /** Distance along the wall centreline from `wall.a` to the near jamb. */
  offsetUm: Um;
  widthUm: Um;
  heightUm: Um;
  sillUm: Um; // 0 for doors
  hinge: 'start' | 'end'; // doors: jamb nearer wall.a ('start') or wall.b ('end') carries the hinge
  /** Doors: side the leaf swings into. Windows: the room-facing side. */
  side: WallSideSign;
}

/** Stored room properties. The room polygon itself is derived from the walls; `seed` ties the two together. */
export interface RoomInfo {
  id: string;
  name: string;
  /** Any point inside the room; re-matched to the detected polygon after every wall edit. */
  seed: Pt;
  ceilingUm: Um;
  floorFinish: string;
  wallColor: string;
}

export interface Plan {
  walls: Wall[];
  rooms: RoomInfo[];
  /** Applies to the whole plan until per-wall provenance arrives. */
  source: Provenance;
  defaultWallThicknessUm: Um;
  defaultCeilingUm: Um;
}

export type TemplateKey = 'wardrobe' | 'tvunit' | 'basecabinet' | 'wallcabinet' | 'tallcabinet';
export type DecorKind = 'bed' | 'sofa' | 'table' | 'side-table' | 'box';
export type FurnitureKind = TemplateKey | DecorKind | 'library' | 'model';

export type WardrobeModuleType = 'shelves' | 'hanging' | 'drawers';

export interface WardrobeParams {
  widthUm: Um;
  heightUm: Um;
  depthUm: Um; // overall, including shutters
  modules: WardrobeModuleType[];
  shelvesPerModule: number;
  drawersPerModule: number;
  shutterCount: number;
}

export type TvModuleType = 'drawer' | 'flap' | 'open';

export interface TvUnitParams {
  widthUm: Um;
  heightUm: Um;
  depthUm: Um;
  mountHeightUm: Um; // underside of console above floor (wall-hung)
  modules: TvModuleType[];
  wallPanelHeightUm: Um; // 0 = none; panel sits on top of the console
}

/** Kitchen base unit (see furniture/basecabinet.ts for limits and construction). */
export interface BaseCabinetParams {
  widthUm: Um;
  /** Floor to carcass top, including the plinth, excluding the worktop. */
  heightUm: Um;
  /** Carcass plus shutters, wall to door face. */
  depthUm: Um;
  plinthUm: Um;
  /** 0 = no worktop. */
  worktopUm: Um;
  front: 'doors' | 'drawers';
  doorCount: number;
  drawerCount: number;
  shelfCount: number;
  /** Cut-out in this unit's worktop (sink bowl or hob). Needs a worktop and a unit at least 600 mm wide. */
  cutout?: 'none' | 'sink' | 'hob';
  /** Blind-corner unit: width of the fixed blind panel (0 / absent = ordinary unit). The panel tucks behind the adjoining run. */
  blindUm?: Um;
  /** Which end of the unit (as seen from the front) carries the blind panel. */
  blindSide?: 'left' | 'right';
}

/** Wall-hung kitchen unit (see furniture/kitchen.ts). */
export interface WallCabinetParams {
  widthUm: Um;
  heightUm: Um;
  depthUm: Um;
  /** Underside of the unit above the floor. */
  mountHeightUm: Um;
  front: 'doors' | 'flap' | 'open';
  doorCount: number;
  shelfCount: number;
}

/** Tall (pantry) unit standing on a plinth. */
export interface TallCabinetParams {
  widthUm: Um;
  /** Floor to top, including the plinth. */
  heightUm: Um;
  depthUm: Um;
  plinthUm: Um;
  doorCount: number;
  shelfCount: number;
  /** Top of the lower doors above the floor; 0 = one full-height door set. */
  splitUm: Um;
}

export interface DecorParams {
  widthUm: Um;
  depthUm: Um;
  heightUm: Um;
  color: string;
}

export interface FurnitureBase {
  id: string;
  name: string;
  xUm: Um; // footprint centre
  yUm: Um;
  /** Rotation about z in degrees. 0 = back of the piece faces north (−y), front faces south. */
  rotDeg: number;
}

export interface WardrobeItem extends FurnitureBase {
  kind: 'wardrobe';
  templateVersion: number;
  rulePackVersion: number;
  params: WardrobeParams;
  materials: { carcass: string; shutter: string };
}

export interface TvUnitItem extends FurnitureBase {
  kind: 'tvunit';
  templateVersion: number;
  rulePackVersion: number;
  params: TvUnitParams;
  materials: { carcass: string; shutter: string };
}

export interface BaseCabinetItem extends FurnitureBase {
  kind: 'basecabinet';
  templateVersion: number;
  rulePackVersion: number;
  params: BaseCabinetParams;
  materials: { carcass: string; shutter: string; worktop: string };
}

export interface WallCabinetItem extends FurnitureBase {
  kind: 'wallcabinet';
  templateVersion: number;
  rulePackVersion: number;
  params: WallCabinetParams;
  materials: { carcass: string; shutter: string };
}

export interface TallCabinetItem extends FurnitureBase {
  kind: 'tallcabinet';
  templateVersion: number;
  rulePackVersion: number;
  params: TallCabinetParams;
  materials: { carcass: string; shutter: string };
}

export interface DecorItem extends FurnitureBase {
  kind: DecorKind;
  params: DecorParams;
}

/** Size of a catalogue or uploaded piece; `elevationUm` lifts wall- and ceiling-mounted items off the floor. */
export interface LibraryParams {
  widthUm: Um;
  depthUm: Um;
  heightUm: Um;
  elevationUm: Um;
}

/** A piece from the built-in catalogue, generated from its size (see catalog/library.ts). */
export interface LibraryItem extends FurnitureBase {
  kind: 'library';
  ref: string;
  params: LibraryParams;
  materials: { main: string; accent: string };
}

/** A studio-uploaded 3D model (GLB), scaled to `params` from its native size. */
export interface ModelItem extends FurnitureBase {
  kind: 'model';
  modelId: string;
  params: LibraryParams;
  native: { widthUm: Um; depthUm: Um; heightUm: Um };
}

export type FurnitureItem = WardrobeItem | TvUnitItem | BaseCabinetItem | WallCabinetItem | TallCabinetItem | DecorItem | LibraryItem | ModelItem;
export type ParametricItem = WardrobeItem | TvUnitItem | BaseCabinetItem | WallCabinetItem | TallCabinetItem;
export type KitchenItem = BaseCabinetItem | WallCabinetItem | TallCabinetItem;

export function isDecor(f: FurnitureItem): f is DecorItem {
  return f.kind === 'bed' || f.kind === 'sofa' || f.kind === 'table' || f.kind === 'side-table' || f.kind === 'box';
}

export function isParametric(f: FurnitureItem): f is ParametricItem {
  return f.kind === 'wardrobe' || f.kind === 'tvunit' || f.kind === 'basecabinet' || f.kind === 'wallcabinet' || f.kind === 'tallcabinet';
}

export function isKitchen(f: FurnitureItem): f is KitchenItem {
  return f.kind === 'basecabinet' || f.kind === 'wallcabinet' || f.kind === 'tallcabinet';
}

/** Construction method, versioned. Pinned per project so rule changes never alter old designs. */
export interface RulePack {
  id: string;
  name: string;
  version: number;
  method: string;
  carcassThicknessUm: Um;
  backThicknessUm: Um;
  shutterThicknessUm: Um;
  shutterGapUm: Um;
  shelfSetbackUm: Um;
  drawerSideClearanceUm: Um; // per side, for runners
  drawerBoxHeightUm: Um;
  drawerBoxThicknessUm: Um;
  edgeBandUm: Um;
  carcassBoard: string;
}

export type RevisionStatus = 'design-approved' | 'released';

export interface ProjectCore {
  plan: Plan;
  openings: Opening[];
  furniture: FurnitureItem[];
  rulePack: RulePack;
}

export interface Revision {
  rev: number;
  label: string;
  status: RevisionStatus;
  createdAt: string;
  hash: string;
  snapshot: ProjectCore;
}

export interface Project extends ProjectCore {
  schemaVersion: number;
  id: string;
  name: string;
  client: string;
  createdAt: string;
  updatedAt: string;
  revisions: Revision[];
  /** Presentation only (not part of revision hashes). Missing = default daylight. */
  lighting?: Lighting;
  /** A scanned or exported floor plan shown under the walls for tracing. Not part of revisions. */
  underlay?: Underlay;
}

export interface Underlay {
  /** Object path in the studio's `plans` storage bucket. */
  path: string;
  /** Top-left corner in plan µm. */
  xUm: Um;
  yUm: Um;
  /** Image width in plan µm (height follows the image's aspect ratio). */
  widthUm: Um;
  /** Image size in pixels, to keep the aspect ratio. */
  pxWidth: number;
  pxHeight: number;
  opacity: number;
  visible: boolean;
}
