/**
 * Why AI cannot be used right now, from what the browser knows (spec 045, contract "Assistant panel").
 * Display only: the server refuses the same cases with 401/403/402.
 */
import type { PayingStudio } from './payingStudio';

export const AI_UNAVAILABLE = {
  noStudio: 'Open or join a studio to use AI.',
  viewer: "Viewers can't use AI. Ask a studio owner for designer access.",
  noCredits: 'Your studio has no AI credits left. Contact Interior Studio to add credits.',
} as const;

export type AiUnavailable = keyof typeof AI_UNAVAILABLE;

export function aiUnavailableReason(payer: PayingStudio | null): AiUnavailable | null {
  if (!payer) return 'noStudio';
  if (payer.role === 'viewer') return 'viewer';
  if (payer.balance === 0) return 'noCredits';
  return null;
}
