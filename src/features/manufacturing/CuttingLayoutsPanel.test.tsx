import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CuttingLayoutsPanel } from './CuttingLayoutsPanel';
import { useBillingStore } from '@/state/billingStore';
import type { NestingResult } from '@/engine/production/nesting/types';

describe('CuttingLayoutsPanel', () => {
  const mockResult: NestingResult = {
    sheets: [
      {
        sheetIndex: 1,
        material: '18mm Plywood',
        thickness: 18,
        boardLength: 2440,
        boardWidth: 1220,
        trimMargin: 10,
        kerf: 3.2,
        placements: [
          {
            panelId: 'p1',
            partName: 'Side',
            sheetIndex: 1,
            x: 10,
            y: 10,
            length: 720,
            width: 560,
            rotated: false,
            banding: '1 long',
            units: ['B1'],
          },
        ],
        offcuts: [
          {
            x: 733.2,
            y: 10,
            length: 1696,
            width: 1200,
            areaMm2: 2035200,
            isReusable: true,
          },
        ],
        usedAreaMm2: 403200,
        usableAreaMm2: 2904000,
        yieldPercentage: 13.88,
      },
      {
        sheetIndex: 2,
        material: '18mm MDF',
        thickness: 18,
        boardLength: 2440,
        boardWidth: 1220,
        trimMargin: 10,
        kerf: 3.2,
        placements: [
          {
            panelId: 'd1',
            partName: 'Door',
            sheetIndex: 2,
            x: 10,
            y: 10,
            length: 716,
            width: 596,
            rotated: false,
            banding: 'all 4',
            units: ['B1'],
          },
        ],
        offcuts: [],
        usedAreaMm2: 426736,
        usableAreaMm2: 2904000,
        yieldPercentage: 14.69,
      },
    ],
    sheetsByMaterial: {
      '18mm Plywood (18mm)': [],
      '18mm MDF (18mm)': [],
    },
    totalSheets: 2,
    totalPartAreaMm2: 829936,
    totalBoardAreaMm2: 5953600,
    netYieldPercentage: 13.94,
    reusableOffcuts: [
      {
        x: 733.2,
        y: 10,
        length: 1696,
        width: 1200,
        areaMm2: 2035200,
        isReusable: true,
      },
    ],
    unplacedPanels: [],
    calculatedAt: '2026-11-02T12:00:00.000Z',
  };

  it('renders overall summary metrics and material tabs', () => {
    render(<CuttingLayoutsPanel initialResult={mockResult} />);

    expect(screen.getByText(/2 Sheets Total/i)).toBeInTheDocument();
    expect(screen.getByText(/13.94%/i)).toBeInTheDocument();
    expect(screen.getByText(/18mm Plywood/i)).toBeInTheDocument();
    expect(screen.getByText(/18mm MDF/i)).toBeInTheDocument();
  });

  it('switches active sheet via sheet carousel buttons', () => {
    render(<CuttingLayoutsPanel initialResult={mockResult} />);

    expect(screen.getByText(/Sheet 1 of 2/i)).toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: /next sheet/i });
    fireEvent.click(nextBtn);

    expect(screen.getByText(/Sheet 2 of 2/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Door/i).length).toBeGreaterThanOrEqual(1);
  });

  it('displays upgrade barrier when current tier is unentitled starter plan without initialResult', () => {
    useBillingStore.setState({ currentTier: 'starter' });
    render(<CuttingLayoutsPanel />);

    expect(screen.getByTestId('nesting-entitlement-barrier')).toBeInTheDocument();
    expect(screen.getByText(/2D Sheet Nesting Requires Pro Studio/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upgrade to Pro Studio/i })).toBeInTheDocument();
  });
});
