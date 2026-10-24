import type { RulePack } from './types';
import { mm } from './units';

export interface Finish {
  id: string;
  name: string;
  color: string;
  kind: 'laminate' | 'veneer' | 'paint';
}

export const FINISHES: Finish[] = [
  { id: 'oak-light', name: 'Light Oak laminate', color: '#c9a77c', kind: 'laminate' },
  { id: 'walnut', name: 'Walnut laminate', color: '#6b4a33', kind: 'laminate' },
  { id: 'teak', name: 'Teak veneer', color: '#9a6a3c', kind: 'veneer' },
  { id: 'white-matte', name: 'Frosty White matte', color: '#ece9e2', kind: 'laminate' },
  { id: 'graphite', name: 'Graphite suede', color: '#4a4c4e', kind: 'laminate' },
  { id: 'sage', name: 'Sage Green PU', color: '#8f9e86', kind: 'paint' },
  { id: 'terracotta', name: 'Terracotta PU', color: '#b86a4b', kind: 'paint' },
  { id: 'ivory', name: 'Ivory satin', color: '#e6dcc7', kind: 'laminate' },
];

/** Worktop surfaces for kitchen base units. */
export const WORKTOP_FINISHES: Finish[] = [
  { id: 'granite-black', name: 'Black galaxy granite', color: '#2b2b2d', kind: 'paint' },
  { id: 'quartz-white', name: 'White quartz', color: '#eceae6', kind: 'paint' },
  { id: 'marble', name: 'Statuario marble', color: '#e7e4de', kind: 'paint' },
  { id: 'oak-butcher', name: 'Oak butcher block', color: '#b8895a', kind: 'veneer' },
  { id: 'steel', name: 'Stainless steel', color: '#b9bcbf', kind: 'paint' },
];

export const FLOOR_FINISHES = [
  { id: 'oak-floor', name: 'Oak planks', color: '#b89466' },
  { id: 'marble', name: 'Statuario marble', color: '#e7e4de' },
  { id: 'vitrified-grey', name: 'Grey vitrified', color: '#a9a7a2' },
  { id: 'terrazzo', name: 'Terrazzo', color: '#d6cec2' },
];

export const WALL_COLORS = [
  { id: 'warm-white', name: 'Warm white', color: '#f1ece3' },
  { id: 'greige', name: 'Greige', color: '#d9d1c4' },
  { id: 'sage-wall', name: 'Sage', color: '#c4ccbb' },
  { id: 'clay', name: 'Clay', color: '#dcc0a8' },
];

export function finishById(id: string): Finish {
  return FINISHES.find((f) => f.id === id) ?? WORKTOP_FINISHES.find((f) => f.id === id) ?? FINISHES[0];
}

/** Default construction method — illustrative until reviewed by the team's carpenter. */
export const DEFAULT_RULE_PACK: RulePack = {
  id: 'box-carcass-18',
  name: '18 mm box carcass, overlay shutters',
  version: 1,
  method:
    'Sides run full height. Top and bottom sit between sides. Fixed partitions between top and bottom. 6 mm back nailed on the rear (full overlay). Shutters full overlay with uniform gaps. Internal drawers on side-mount runners behind shutters.',
  carcassThicknessUm: mm(18),
  backThicknessUm: mm(6),
  shutterThicknessUm: mm(18),
  shutterGapUm: mm(3),
  shelfSetbackUm: mm(20),
  drawerSideClearanceUm: mm(12.5),
  drawerBoxHeightUm: mm(150),
  drawerBoxThicknessUm: mm(12),
  edgeBandUm: mm(0.8),
  carcassBoard: 'BWP plywood, 18 mm',
};

export const BOARD_SHEET = { lengthUm: mm(2440), widthUm: mm(1220), wasteFactor: 1.15 };
