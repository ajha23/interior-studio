/**
 * Reads a home brief from plain words: "3BHK apartment", "a 4 bedroom villa of 2,400 sq ft",
 * "2 bhk flat, japandi", "design a villa with 4 bedrooms, 220 m2". Returns null when the text is
 * not asking for a whole home.
 */
import { HOME_STYLES, type HomeBrief, type HomeStyleId } from './generate';

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, single: 1 };

export function parseHomeBrief(text: string): HomeBrief | null {
  const t = text.toLowerCase().replace(/,/g, '');
  const bhk = /\b(\d|one|two|three|four|five|six)\s*-?\s*(?:bhk|b\.h\.k|bed(?:room)?s?\b(?:\s*(?:house|home|flat|apartment|villa))?)/.exec(t);
  const villa = /\b(villa|bungalow|independent house|duplex|2[- ]stor(?:e)?y|two[- ]stor(?:e)?y)\b/.test(t);
  // "House"/"home" alone is too common ("a kitchen for my house"): only "whole home" counts.
  const home = /\b(bhk|flat|apartment|villa|bungalow|duplex|whole (?:home|house))\b/.test(t);
  if (!bhk && !(home && /\b(design|make|create|generate|plan|build|layout|whole)\b/.test(t))) return null;
  if (!bhk && /\b(kitchen|cabinet|wardrobe|room)\b/.test(t) && !/\b(villa|apartment|flat|whole)\b/.test(t)) return null;
  const n = bhk ? (WORDS[bhk[1]!] ?? Number(bhk[1])) : villa ? 4 : 2;
  const sqft = /(\d{3,5})\s*(?:sq\.?\s*ft|sqft|square feet|sft)\b/.exec(t);
  const m2 = /(\d{2,4})\s*(?:m2|m²|sq\.?\s*m|square met(?:er|re)s?)\b/.exec(t);
  const area = sqft ? Number(sqft[1]) : m2 ? Number(m2[1]) * 10.7639 : undefined;
  const style = (Object.keys(HOME_STYLES) as HomeStyleId[]).find((s) => t.includes(s) || t.includes(HOME_STYLES[s].label.toLowerCase())) ?? (/\b(wood|wooden|warm)\b/.test(t) ? 'warm' : /\b(brick|loft|concrete)\b/.test(t) ? 'industrial' : /\b(minimal|scandi|zen)\b/.test(t) ? 'japandi' : undefined);
  return { bhk: Math.min(6, Math.max(1, n)), kind: villa ? 'villa' : 'apartment', ...(area ? { carpetAreaSqft: Math.round(area) } : {}), ...(style ? { style } : {}) };
}
