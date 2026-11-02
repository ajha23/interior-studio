import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SheetCanvasViewer } from './SheetCanvasViewer';
import type { NestedSheet } from '@/engine/production/nesting/types';

describe('SheetCanvasViewer', () => {
  const mockSheet: NestedSheet = {
    sheetIndex: 1,
    material: '18mm Plywood',
    thickness: 18,
    boardLength: 2440,
    boardWidth: 1220,
    trimMargin: 10,
    kerf: 3.2,
    placements: [
      {
        panelId: 'p1#1',
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
      {
        panelId: 'd1#1',
        partName: 'Door',
        sheetIndex: 1,
        x: 733.2,
        y: 10,
        length: 716,
        width: 596,
        rotated: false,
        banding: 'all 4',
        units: ['B1'],
      },
    ],
    offcuts: [
      {
        x: 1452.4,
        y: 10,
        length: 977,
        width: 1200,
        areaMm2: 1172400,
        isReusable: true,
      },
    ],
    usedAreaMm2: 830136,
    usableAreaMm2: 2904000,
    yieldPercentage: 28.59,
  };

  it('renders the SVG board and nested panels', () => {
    render(<SheetCanvasViewer sheet={mockSheet} />);

    expect(screen.getByTestId('sheet-canvas-svg')).toBeInTheDocument();
    expect(screen.getByText(/Side/i)).toBeInTheDocument();
    expect(screen.getByText(/Door/i)).toBeInTheDocument();
    expect(screen.getByText(/720 × 560/i)).toBeInTheDocument();
  });

  it('renders reusable offcut region with dimensions', () => {
    render(<SheetCanvasViewer sheet={mockSheet} />);

    expect(screen.getByText(/Reusable Offcut \(977 × 1200\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Offcut/i).length).toBeGreaterThanOrEqual(1);
  });

  it('calls onSelectPlacement when a panel is clicked', () => {
    const handleSelect = vi.fn();
    render(<SheetCanvasViewer sheet={mockSheet} onSelectPlacement={handleSelect} />);

    const panelElement = screen.getByTestId('panel-rect-p1#1');
    fireEvent.click(panelElement);

    expect(handleSelect).toHaveBeenCalledWith('p1#1');
  });

  it('provides zoom in, zoom out, and reset controls', () => {
    render(<SheetCanvasViewer sheet={mockSheet} />);

    const zoomInBtn = screen.getByRole('button', { name: /zoom in/i });
    const zoomOutBtn = screen.getByRole('button', { name: /zoom out/i });
    const resetBtn = screen.getByRole('button', { name: /reset zoom/i });

    expect(zoomInBtn).toBeInTheDocument();
    expect(zoomOutBtn).toBeInTheDocument();
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomOutBtn);
    fireEvent.click(resetBtn);
  });
});
