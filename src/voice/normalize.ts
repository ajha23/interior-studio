/**
 * Spoken-language normalisation, kept apart from geometry: it only rewrites how numbers and units
 * were said ("nine hundred millimetres", "twelve foot six", "two point five metres") into the text
 * the existing length parser reads ("900 mm", "12 ft 6 in", "2.5 m"). It never adds a value or unit
 * that was not spoken, and decimal feet stay decimal feet ("12.5 feet" is 12 ft 6 in, not 12 ft 5 in).
 * Validation, unit conversion and rounding happen later, in the same pipeline as typed requests.
 */

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const isNumberWord = (w: string) => w in UNITS || w in TENS || w === 'hundred' || w === 'thousand';

/** Value of a run of number words ("one thousand two hundred and fifty"), or null. */
function wordsToNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  for (const w of words) {
    if (w in UNITS) current += UNITS[w]!;
    else if (w in TENS) current += TENS[w]!;
    else if (w === 'hundred') current = (current || 1) * 100;
    else if (w === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
    } else if (w === 'and' || w === 'a') continue;
    else return null;
    seen = true;
  }
  return seen ? total + current : null;
}

/** Replaces spoken numbers with digits: "twelve and a half" → "12.5", "two point five" → "2.5". */
export function spokenNumbersToDigits(text: string): string {
  const tokens = text.split(/(\s+)/);
  const out: string[] = [];
  let i = 0;
  const word = (k: number) => tokens[k]?.toLowerCase().replace(/[^a-z-]/g, '') ?? '';
  while (i < tokens.length) {
    const w = word(i);
    const starts = isNumberWord(w.split('-')[0]!) || ((w === 'a' || w === 'an') && (word(i + 2) === 'hundred' || word(i + 2) === 'thousand'));
    if (!starts) {
      out.push(tokens[i]!);
      i++;
      continue;
    }
    // Collect number words (and "and" between them, "twenty-five" style hyphens).
    const run: string[] = [];
    let j = i;
    while (j < tokens.length) {
      const t = word(j);
      if (!t) {
        j++;
        continue;
      }
      const parts = t.split('-');
      if (parts.every((p) => isNumberWord(p) || ((p === 'a' || p === 'an') && run.length === 0))) {
        run.push(...parts);
        j++;
        continue;
      }
      // "and" only when another number word follows ("one hundred and twenty").
      if (t === 'and' && isNumberWord(word(j + 2)) && run.length) {
        run.push('and');
        j++;
        continue;
      }
      break;
    }
    // Do not swallow trailing whitespace tokens.
    while (j > i && !tokens[j - 1]!.trim()) j--;
    const value = wordsToNumber(run.map((r) => (r === 'an' ? 'a' : r)));
    if (value === null) {
      out.push(tokens[i]!);
      i++;
      continue;
    }
    let text = String(value);
    let k = j;
    // "two point five", "point seven five"
    if (word(k + 1) === 'point') {
      const digits: string[] = [];
      let m = k + 3;
      while (word(m) in UNITS && UNITS[word(m)]! < 10) {
        digits.push(String(UNITS[word(m)]));
        m += 2;
      }
      if (digits.length) {
        text += `.${digits.join('')}`;
        k = m - 2 + 1;
      }
    }
    // "twelve and a half"
    if (word(k + 1) === 'and' && word(k + 3) === 'a' && word(k + 5) === 'half') {
      text = String(Number(text) + 0.5);
      k += 6;
    }
    out.push(text);
    i = k;
  }
  return out.join('').replace(/\s+/g, ' ').trim();
}

/** Spoken unit names and feet-and-inches forms → what the length parser reads. */
export function normaliseUnits(text: string): string {
  return (
    text
      // "2 point 5" (digits read out around "point")
      .replace(/\b(\d+) point (\d+)\b/gi, '$1.$2')
      .replace(/\b(\d+(?:\.\d+)?) and a half\b/gi, (_m, n: string) => String(Number(n) + 0.5))
      .replace(/\bhalf an? (inch|foot|metre|meter)\b/gi, '0.5 $1')
      // UK "mil(s)" = millimetres
      .replace(/\b(\d+(?:\.\d+)?)\s*(?:mils?|millimet(?:er|re)s?|mm\.)(?![a-z])/gi, '$1 mm')
      .replace(/\b(\d+(?:\.\d+)?)\s*centimet(?:er|re)s?\b/gi, '$1 cm')
      .replace(/\b(\d+(?:\.\d+)?)\s*met(?:er|re)s?\b/gi, '$1 m')
      .replace(/\b(\d+(?:\.\d+)?)\s*(?:inches|inch|in\.)(?![a-z])/gi, '$1 in')
      .replace(/\b(\d+(?:\.\d+)?)\s*(?:feet|foot)\b/gi, '$1 ft')
      // "12 ft 6" with nothing after the 6 means 12 ft 6 in ("twelve foot six").
      .replace(/\b(\d+) ft (\d+(?:\.\d+)?)(?!\s*(?:mm|cm|m\b|in\b|ft\b|"|'|°|degrees?|percent|%|\d|by\b|x\b|×))/gi, '$1 ft $2 in')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** A spoken request, normalised for the assistant. Punctuation the recogniser adds at the end is dropped. */
export function normaliseSpokenRequest(transcript: string): string {
  const t = transcript.trim().replace(/[.!]+$/, '');
  return normaliseUnits(spokenNumbersToDigits(t));
}

export type VoiceIntent = 'stop' | 'cancel' | 'approve' | 'reject' | null;

/** Voice-only control phrases, handled before anything reaches the assistant. */
export function voiceIntent(transcript: string): VoiceIntent {
  const t = transcript.toLowerCase().replace(/[.,!?]/g, '').replace(/\s+/g, ' ').trim();
  if (/^(stop listening|stop|that's all|that is all)$/.test(t)) return 'stop';
  if (/^(cancel|never ?mind|forget it|cancel that)$/.test(t)) return 'cancel';
  if (/^(apply|apply it|apply that|apply the change|yes apply( it)?|approve|approve it|confirm|go ahead|do it|yes do it)$/.test(t)) return 'approve';
  if (/^(reject|reject it|reject that|no don't|don't apply( it)?|discard( it)?|no thanks)$/.test(t)) return 'reject';
  return null;
}
