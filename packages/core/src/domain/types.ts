import type { Um } from './units';

export const SCHEMA_VERSION = 2;

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

export type TemplateKey = 'wardrobe' | 'tvunit';
export type DecorKind = 'bed' | 'sofa' | 'table' | 'side-table' | 'box';
export type FurnitureKind = TemplateKey | DecorKind;

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

export interface DecorItem extends FurnitureBase {
  kind: DecorKind;
  params: DecorParams;
}

export type FurnitureItem = WardrobeItem | TvUnitItem | DecorItem;

export function isParametric(f: FurnitureItem): f is WardrobeItem | TvUnitItem {
  return f.kind === 'wardrobe' || f.kind === 'tvunit';
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
}
