import type { ClosureResult, WallMeasurement } from '@/domain/measurement/siteCapture';

/**
 * Permissible site measurement loop tolerance as mandated by PRD v2 MT-04:
 * ±10mm maximum allowable closure gap before warning.
 */
export const MAX_CLOSURE_TOLERANCE_MM = 10;

/**
 * Evaluates loop closure across opposite walls in a room:
 * - Back wall length vs Front wall length (X-axis)
 * - Left wall length vs Right wall length (Z-axis)
 *
 * Vector closure gap: Delta = sqrt((L_back - L_front)^2 + (L_left - L_right)^2)
 */
export function evaluateRoomClosure(measurements: WallMeasurement[]): ClosureResult {
  const getLength = (wId: string) => measurements.find((m) => m.wallId === wId)?.lengthMm ?? 0;

  const back = getLength('back');
  const front = getLength('front');
  const left = getLength('left');
  const right = getLength('right');

  if (back === 0 || front === 0 || left === 0 || right === 0) {
    return {
      isClosed: false,
      closureErrorMm: 0,
      status: 'warning',
      message: 'Incomplete measurements: All 4 walls (Back, Left, Right, Front) must be measured.',
    };
  }

  const deltaX = Math.abs(back - front);
  const deltaZ = Math.abs(left - right);
  const closureErrorMm = Math.round(Math.hypot(deltaX, deltaZ));

  const isClosed = closureErrorMm <= MAX_CLOSURE_TOLERANCE_MM;

  if (isClosed) {
    return {
      isClosed: true,
      closureErrorMm,
      status: 'acceptable',
      message: `Room geometry is closed within ±10mm tolerance (discrepancy: ${closureErrorMm}mm).`,
    };
  }

  return {
    isClosed: false,
    closureErrorMm,
    status: 'warning',
    message: `Closure warning: Discrepancy is ${closureErrorMm}mm (exceeds ${MAX_CLOSURE_TOLERANCE_MM}mm limit). Please re-measure wall lengths or out-of-square diagonals.`,
  };
}

