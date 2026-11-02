import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WalkthroughVideoModal } from './WalkthroughVideoModal';
import { useWalkthroughStore } from '@/state/walkthroughStore';

describe('WalkthroughVideoModal (PR-04)', () => {
  const room = { width: 4000, length: 3000, height: 2800 };

  beforeEach(() => {
    vi.useFakeTimers();
    useWalkthroughStore.setState({
      currentJob: null,
      history: [],
      isModalOpen: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders presets and starts job when button clicked', () => {
    render(<WalkthroughVideoModal projectId="proj_1" room={room} />);

    expect(screen.getByText(/Cinematic 3D Video Walkthrough/)).toBeDefined();
    expect(screen.getByTestId('res-1080p-btn')).toBeDefined();

    const startBtn = screen.getByTestId('start-video-render-btn');
    fireEvent.click(startBtn);

    expect(useWalkthroughStore.getState().currentJob).not.toBeNull();
    expect(screen.getByTestId('render-progress-bar')).toBeDefined();
  });

  it('progresses to 100% and displays download button', async () => {
    render(<WalkthroughVideoModal projectId="proj_1" room={room} />);

    fireEvent.click(screen.getByTestId('start-video-render-btn'));

    // Step through the timers so state updates trigger sequentially
    for (let i = 0; i < 6; i++) {
      act(() => {
        vi.advanceTimersByTime(700);
      });
    }

    expect(screen.getByTestId('download-video-btn')).toBeDefined();
    expect(screen.getByText(/Rendering Complete/)).toBeDefined();
  });
});
