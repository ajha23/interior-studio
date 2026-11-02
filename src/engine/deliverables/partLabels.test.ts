import { describe, it, expect } from 'vitest';
import { generatePartLabelsSvg, renderSingleLabelSvg } from './partLabels';
import type { ManufacturingPart } from '../manufacturing/explode';

describe('Factory Part Labels Generator', () => {
  const samplePart: ManufacturingPart = {
    partId: 'C1-S1',
    moduleCode: 'BASE-600',
    elementId: 'c1',
    name: 'Left Side (Gable)',
    material: 'PLY18-WHT',
    role: 'carcass',
    quantity: 1,
    finishedLength: 720,
    finishedWidth: 560,
    cuttingLength: 720,
    cuttingWidth: 559.2,
    thickness: 18,
    grain: 'L',
    edgeBanding: { w1: 'EB-0.8-PVC' },
    holes: [],
  };

  it('renders a single 100x50mm label with dimensions and QR code', () => {
    const svg = renderSingleLabelSvg(samplePart, 0, 0, 'PRJ-401');
    expect(svg).toContain('Left Side (Gable)');
    expect(svg).toContain('720 × 560 × 18 mm');
    expect(svg).toContain('720 × 559.2 mm');
    expect(svg).toContain('PLY18-WHT');
    expect(svg).toContain('EB-0.8-PVC');
    expect(svg).toContain('SCAN FOR 3D');
    expect(svg).toContain('<path d="M'); // QR pattern
  });

  it('generates thermal roll SVG for multiple parts', () => {
    const parts = [samplePart, { ...samplePart, partId: 'C1-S2', name: 'Right Side (Gable)' }];
    const thermalSvg = generatePartLabelsSvg(parts, { format: 'thermal-100x50', projectCode: 'TEST-PRJ' });

    expect(thermalSvg).toContain('width="100mm"');
    expect(thermalSvg).toContain('height="104mm"');
    expect(thermalSvg).toContain('C1-S1');
    expect(thermalSvg).toContain('C1-S2');
  });

  it('generates A4 printable sheet format', () => {
    const parts = [samplePart];
    const a4Svg = generatePartLabelsSvg(parts, { format: 'a4-21up', projectCode: 'TEST-PRJ' });

    expect(a4Svg).toContain('width="210mm"');
    expect(a4Svg).toContain('height="297mm"');
    expect(a4Svg).toContain('viewBox="0 0 210 297"');
    expect(a4Svg).toContain('Left Side (Gable)');
  });
});

