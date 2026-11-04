/**
 * Grain Orientation Policy & Rotation Rules
 * Feature: 032-sheet-nesting-optimization
 * Architecture: src/engine/production/nesting/ (Framework-free TypeScript)
 * Constitution Authority: Principle V, Principle I
 */

import type { GrainDirection, InputNestingPanel } from './types';

/**
 * Exterior front parts that strictly require lengthwise grain lock to maintain aesthetic consistency.
 */
const FRONT_PART_PATTERNS = [
  /^door/i,
  /^drawer front/i,
  /^tall unit shutter/i,
  /^shutter/i,
  /^glass door frame/i,
  /^blind panel/i,
  /^front/i,
];

/**
 * Determines whether a panel part role naturally demands a grain lock.
 */
export function inferGrainFromPart(partName: string, group?: string): GrainDirection {
  if (group === 'front') {
    return 'lengthwise';
  }
  const isFront = FRONT_PART_PATTERNS.some((pattern) => pattern.test(partName.trim()));
  return isFront ? 'lengthwise' : 'none';
}

/**
 * Evaluates whether a panel is allowed to rotate 90° on the raw board.
 */
export function canRotate(panel: InputNestingPanel): boolean {
  // If explicitly locked to lengthwise or crosswise grain, rotation is forbidden
  if (panel.grain === 'lengthwise' || panel.grain === 'crosswise') {
    return false;
  }
  return true;
}

/**
 * Calculates oriented dimensions based on rotation state.
 */
export function getOrientedDimensions(
  length: number,
  width: number,
  rotated: boolean
): { length: number; width: number } {
  return rotated ? { length: width, width: length } : { length, width };
}
