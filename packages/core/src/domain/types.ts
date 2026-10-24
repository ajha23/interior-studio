import type { Um } from './units';

export const SCHEMA_VERSION = 1;

/** Where a dimension came from — an estimate must never be presented as a verified measurement. */
export type Provenance = 'site_measured' | 'drawing' | 'estimate';

export type WallSide = 'N' | 'E' | 'S' | 'W';

/**
 * Room coordinate system (plan view):
 *   origin = inside face of the north-west corner
 *   +x → east along the north wall, +y → south, z → up from finished floor
 */
export interface Room {
  name: string;
  widthUm: Um; // inside, west → east
  depthUm: Um; // inside, north → south
  ceilingUm: Um;
  wallThicknessUm: Um;
  source: Provenance;
  floorFinish: string;
  wallColor: string;
}

export interface Opening {
  id: string;
  kind: 'door' | 'window';
  wall: WallSide;
  /** Distance from the wall's start (N/S walls: from west end; E/W walls: from north end) to the near jamb. */
  offsetUm: Um;
  widthUm: Um;
  heightUm: Um;
  sillUm: Um; // 0 for doors
  hinge: 'start' | 'end'; // doors: which jamb carries the hinge
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
  room: Room;
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
