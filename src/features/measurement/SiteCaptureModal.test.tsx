import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SiteCaptureModal } from './SiteCaptureModal';
import { useSiteCaptureStore } from '@/state/siteCaptureStore';

describe('SiteCaptureModal (MT-04, MT-05)', () => {
  beforeEach(() => {
    useSiteCaptureStore.setState({
      isModalOpen: true,
      activeWall: 'back',
      photos: [],
      measurements: [
        { wallId: 'back', lengthMm: 4000, heightMm: 2800 },
        { wallId: 'front', lengthMm: 4000, heightMm: 2800 },
        { wallId: 'left', lengthMm: 3000, heightMm: 2800 },
        { wallId: 'right', lengthMm: 3000, heightMm: 2800 },
      ],
      closure: {
        isClosed: true,
        closureErrorMm: 0,
        status: 'acceptable',
        message: 'Room geometry is closed within ±10mm tolerance.',
      },
    });
  });

  it('renders modal header, closure diagnostic, and wall tabs', () => {
    render(<SiteCaptureModal projectId="proj_test" />);

    expect(screen.getByText(/Site Measurement & Photo Capture/)).toBeDefined();
    expect(screen.getByTestId('closure-diagnostic-banner')).toBeDefined();
    expect(screen.getByTestId('wall-tab-back')).toBeDefined();
    expect(screen.getByTestId('wall-tab-left')).toBeDefined();
  });

  it('switches active wall tab and updates inputs', () => {
    render(<SiteCaptureModal projectId="proj_test" />);

    fireEvent.click(screen.getByTestId('wall-tab-left'));
    expect(useSiteCaptureStore.getState().activeWall).toBe('left');
    expect(screen.getByText('LEFT Wall Dimensions')).toBeDefined();
  });

  it('submits updated wall measurement and updates closure state', () => {
    render(<SiteCaptureModal projectId="proj_test" />);

    const lengthInput = screen.getByTestId('wall-length-input');
    fireEvent.change(lengthInput, { target: { value: '4030' } });

    fireEvent.click(screen.getByTestId('save-wall-dimension-btn'));

    expect(useSiteCaptureStore.getState().measurements.find((m) => m.wallId === 'back')?.lengthMm).toBe(4030);
    expect(useSiteCaptureStore.getState().closure.status).toBe('warning');
  });
});

