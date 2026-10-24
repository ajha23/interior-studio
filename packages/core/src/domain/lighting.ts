/**
 * Scene lighting: a preset plus a few adjustments, stored on the project so the 3D view, the
 * photoreal renderer and client share links all show the same mood.
 */
export type LightingPreset = 'daylight' | 'golden' | 'overcast' | 'evening' | 'night';

export interface Lighting {
  preset: LightingPreset;
  /** Exposure in stops, −2 … +2. */
  exposure: number;
  /** Compass direction the sun comes from, degrees clockwise from plan north (−y). */
  sunAzimuthDeg: number;
  /** Whether catalogue light fittings (pendants, lamps, sconces) are switched on. */
  fixturesOn: boolean;
}

export interface LightingSpec {
  label: string;
  hint: string;
  sky: { zenith: [number, number, number]; horizon: [number, number, number]; ground: [number, number, number]; gain: number };
  /** null = no direct sun. */
  sun: { color: string; intensity: number; elevationDeg: number } | null;
  /** Ceiling panels per room. */
  interior: { color: string; intensity: number };
  /** Light fittings, when switched on. */
  fixture: { color: string; intensity: number; emissive: number };
  /** Base exposure for ACES tone mapping. */
  exposure: number;
  /** Real-time preview: hemisphere sky/ground colours and intensity. */
  preview: { sky: string; ground: string; hemi: number; ambient: number; background: [string, string] };
}

export const LIGHTING_PRESETS: Record<LightingPreset, LightingSpec> = {
  daylight: {
    label: 'Daylight',
    hint: 'Bright midday sky and sun through the windows',
    sky: { zenith: [0.55, 0.72, 1.0], horizon: [1.0, 0.96, 0.9], ground: [0.42, 0.38, 0.33], gain: 0.55 },
    sun: { color: '#fff1dc', intensity: 1.4, elevationDeg: 55 },
    interior: { color: '#fff4e6', intensity: 2.5 },
    fixture: { color: '#ffe2b8', intensity: 0.6, emissive: 0.3 },
    exposure: 0.9,
    preview: { sky: '#fff8ec', ground: '#8a8070', hemi: 0.9, ambient: 0.25, background: ['#ece8df', '#d9d3c7'] },
  },
  golden: {
    label: 'Golden hour',
    hint: 'Low warm sun, long shadows',
    sky: { zenith: [0.45, 0.5, 0.75], horizon: [1.0, 0.72, 0.45], ground: [0.35, 0.27, 0.2], gain: 0.45 },
    sun: { color: '#ffb36b', intensity: 1.8, elevationDeg: 12 },
    interior: { color: '#ffe0b8', intensity: 1.5 },
    fixture: { color: '#ffcf94', intensity: 1.2, emissive: 0.8 },
    exposure: 1.0,
    preview: { sky: '#ffd9ad', ground: '#6e5a48', hemi: 0.75, ambient: 0.2, background: ['#f1ddc4', '#d8c1a6'] },
  },
  overcast: {
    label: 'Overcast',
    hint: 'Soft, even light without hard shadows',
    sky: { zenith: [0.8, 0.82, 0.86], horizon: [0.9, 0.9, 0.9], ground: [0.4, 0.4, 0.4], gain: 0.7 },
    sun: null,
    interior: { color: '#f4f6ff', intensity: 2.5 },
    fixture: { color: '#ffe8c8', intensity: 0.6, emissive: 0.3 },
    exposure: 1.1,
    preview: { sky: '#eef0f4', ground: '#8c8c8c', hemi: 1.05, ambient: 0.35, background: ['#e6e8eb', '#cfd2d6'] },
  },
  evening: {
    label: 'Evening',
    hint: 'Dusk outside, warm lamps and ceiling lights on',
    sky: { zenith: [0.08, 0.1, 0.18], horizon: [0.35, 0.25, 0.22], ground: [0.06, 0.05, 0.05], gain: 0.12 },
    sun: null,
    interior: { color: '#ffd9a8', intensity: 6 },
    fixture: { color: '#ffc77d', intensity: 3, emissive: 2 },
    exposure: 1.2,
    preview: { sky: '#7d7a90', ground: '#3a3330', hemi: 0.45, ambient: 0.15, background: ['#3b3f52', '#22252f'] },
  },
  night: {
    label: 'Night',
    hint: 'Dark outside, only the room’s own lights',
    sky: { zenith: [0.01, 0.015, 0.03], horizon: [0.03, 0.03, 0.05], ground: [0.01, 0.01, 0.01], gain: 0.05 },
    sun: null,
    interior: { color: '#ffd29a', intensity: 4 },
    fixture: { color: '#ffbf70', intensity: 4.5, emissive: 3 },
    exposure: 1.35,
    preview: { sky: '#4a4c66', ground: '#1c1a1a', hemi: 0.3, ambient: 0.1, background: ['#1d2030', '#101219'] },
  },
};

export const DEFAULT_LIGHTING: Lighting = { preset: 'daylight', exposure: 0, sunAzimuthDeg: 210, fixturesOn: true };

export function lightingOf(p: { lighting?: Lighting }): Lighting {
  return { ...DEFAULT_LIGHTING, ...(p.lighting ?? {}) };
}
