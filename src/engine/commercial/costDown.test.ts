import { describe, it, expect } from 'vitest';
import { analyzeCostDownOpportunities } from './costDown';

describe('Cost-Down Optimization Engine (AI-03, CP-05)', () => {
  it('detects two 300mm narrow units and suggests consolidating into one 600mm unit', () => {
    const cabinets = [
      { id: 'c1', type: 'base', dimensions: { width: 300, height: 720, depth: 560 } },
      { id: 'c2', type: 'base', dimensions: { width: 300, height: 720, depth: 560 } },
      { id: 'c3', type: 'base', dimensions: { width: 900, height: 720, depth: 560 } },
    ];

    const suggestions = analyzeCostDownOpportunities(cabinets);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0]?.type).toBe('consolidate_units');
    expect(suggestions[0]?.elementIdsToReplace).toEqual(['c1', 'c2']);
    expect(suggestions[0]?.replacementDimensions.width).toBe(600);
    expect(suggestions[0]?.savingsPaise).toBeGreaterThan(0);
    expect(suggestions[0]?.formattedSavings).toContain('₹');
  });

  it('detects two 450mm units and suggests consolidating into one 900mm unit', () => {
    const cabinets = [
      { id: 'c1', type: 'drawer', dimensions: { width: 450, height: 720, depth: 560 } },
      { id: 'c2', type: 'drawer', dimensions: { width: 450, height: 720, depth: 560 } },
    ];

    const suggestions = analyzeCostDownOpportunities(cabinets);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0]?.replacementDimensions.width).toBe(900);
    expect(suggestions[0]?.replacementModuleCode).toBe('BASE-STD-900');
  });

  it('returns empty suggestions when all units are already wide and optimized', () => {
    const cabinets = [
      { id: 'c1', type: 'base', dimensions: { width: 600, height: 720, depth: 560 } },
      { id: 'c2', type: 'base', dimensions: { width: 900, height: 720, depth: 560 } },
    ];

    const suggestions = analyzeCostDownOpportunities(cabinets);
    expect(suggestions.length).toBe(0);
  });
});

