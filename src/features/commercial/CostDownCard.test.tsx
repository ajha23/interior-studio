import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CostDownCard } from './CostDownCard';
import type { CostDownSuggestion } from '@/engine/commercial/costDown';

describe('CostDownCard (AI-03 / CP-05)', () => {
  const suggestions: CostDownSuggestion[] = [
    {
      id: 'cd_1',
      type: 'consolidate_units',
      title: 'Consolidate 2× 300mm Units → 1× 600mm Unit',
      description: 'Replace two 300mm units with a single 600mm cabinet.',
      elementIdsToReplace: ['c1', 'c2'],
      replacementModuleCode: 'BASE-STD-600',
      replacementDimensions: { width: 600, height: 720, depth: 560 },
      savingsPaise: 116500,
      formattedSavings: '₹1,165.00',
      explanation: 'Eliminates 2 redundant carcase side panels.',
    },
  ];

  it('renders suggestion details and formatted savings', () => {
    render(<CostDownCard suggestions={suggestions} />);
    expect(screen.getByText(/Cost-Down Advisor/)).toBeDefined();
    expect(screen.getByText('Consolidate 2× 300mm Units → 1× 600mm Unit')).toBeDefined();
    expect(screen.getByText('Save ₹1,165.00')).toBeDefined();
  });

  it('triggers onApply callback when Apply button is clicked', () => {
    const handleApply = vi.fn();
    render(<CostDownCard suggestions={suggestions} onApply={handleApply} />);

    const btn = screen.getByTestId('apply-cost-down-cd_1');
    fireEvent.click(btn);
    expect(handleApply).toHaveBeenCalledWith(suggestions[0]);
  });

  it('renders disabled state when already applied', () => {
    render(<CostDownCard suggestions={suggestions} appliedIds={['cd_1']} />);
    const btn = screen.getByTestId('apply-cost-down-cd_1');
    expect(btn.getAttribute('disabled')).toBeDefined();
    expect(screen.getByText('Applied')).toBeDefined();
  });
});

