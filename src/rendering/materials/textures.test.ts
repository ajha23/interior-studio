import { describe, expect, it } from 'vitest';
import { effectiveTexture, tileSizeMm } from './textures';

describe('finish textures', () => {
  it('reads textures for finishes saved before textures existed', () => {
    expect(effectiveTexture({ id: 'x', name: 'Oak planks', category: 'floor', color: '#c7a27b', roughness: 0.6, metalness: 0 })).toEqual({ texture: 'planks', textureScale: 180 });
    expect(effectiveTexture({ id: 'counter-quartz-white', name: 'White quartz', category: 'countertop', color: '#ebe9e4', roughness: 0.25, metalness: 0 })).toMatchObject({ texture: 'marble' });
    expect(effectiveTexture({ id: 'y', name: 'Graphite', category: 'shutter', color: '#3b3c3f', roughness: 0.45, metalness: 0 })).toEqual({});
    expect(effectiveTexture({ id: 'z', name: 'Warm white', category: 'wall', color: '#f3f0e9', roughness: 0.9, metalness: 0 })).toMatchObject({ texture: 'plaster' });
    expect(tileSizeMm({ texture: 'planks', textureScale: 180 })).toBe(720);
  });
});
