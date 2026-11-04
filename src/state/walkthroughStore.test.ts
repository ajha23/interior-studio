import { describe, it, expect, beforeEach } from 'vitest';
import { useWalkthroughStore } from './walkthroughStore';

describe('Walkthrough Video State Store (PR-04)', () => {
  beforeEach(() => {
    useWalkthroughStore.setState({
      currentJob: null,
      history: [],
      isModalOpen: false,
    });
  });

  it('manages modal open and close states', () => {
    expect(useWalkthroughStore.getState().isModalOpen).toBe(false);
    useWalkthroughStore.getState().openModal();
    expect(useWalkthroughStore.getState().isModalOpen).toBe(true);
    useWalkthroughStore.getState().closeModal();
    expect(useWalkthroughStore.getState().isModalOpen).toBe(false);
  });

  it('starts a job and updates progress through to completion', () => {
    const room = { width: 3500, length: 3000, height: 2700 };
    useWalkthroughStore.getState().startJob('proj_test', room);

    let job = useWalkthroughStore.getState().currentJob;
    expect(job).not.toBeNull();
    expect(job?.status).toBe('queued');

    useWalkthroughStore.getState().updateJobProgress(45);
    job = useWalkthroughStore.getState().currentJob;
    expect(job?.status).toBe('rendering');
    expect(job?.progressPct).toBe(45);

    const testUrl = 'blob:http://localhost:3000/mock-video.mp4';
    useWalkthroughStore.getState().completeJob(testUrl);
    job = useWalkthroughStore.getState().currentJob;
    expect(job?.status).toBe('ready');
    expect(job?.progressPct).toBe(100);
    expect(job?.downloadUrl).toBe(testUrl);

    expect(useWalkthroughStore.getState().history.length).toBe(1);
  });
});

