import { describe, it, expect, beforeEach } from 'vitest';
import { useSiteCaptureStore } from './siteCaptureStore';

describe('Site Capture State Store (MT-03, MT-05)', () => {
  beforeEach(() => {
    useSiteCaptureStore.setState({
      isModalOpen: false,
      activeWall: 'back',
      photos: [],
      measurements: [
        { wallId: 'back', lengthMm: 4000, heightMm: 2800 },
        { wallId: 'front', lengthMm: 4000, heightMm: 2800 },
        { wallId: 'left', lengthMm: 3000, heightMm: 2800 },
        { wallId: 'right', lengthMm: 3000, heightMm: 2800 },
      ],
    });
  });

  it('manages modal and active wall selection', () => {
    expect(useSiteCaptureStore.getState().isModalOpen).toBe(false);
    useSiteCaptureStore.getState().openModal();
    expect(useSiteCaptureStore.getState().isModalOpen).toBe(true);

    useSiteCaptureStore.getState().setActiveWall('left');
    expect(useSiteCaptureStore.getState().activeWall).toBe('left');
  });

  it('adds and deletes wall-tagged photos', () => {
    useSiteCaptureStore.getState().addPhoto({
      projectId: 'p1',
      wallId: 'back',
      url: 'data:image/jpeg;base64,mock',
      caption: 'Main wall with conduit',
    });

    expect(useSiteCaptureStore.getState().photos.length).toBe(1);
    const photo = useSiteCaptureStore.getState().photos[0]!;
    expect(photo.wallId).toBe('back');
    expect(photo.caption).toBe('Main wall with conduit');

    useSiteCaptureStore.getState().deletePhoto(photo.id);
    expect(useSiteCaptureStore.getState().photos.length).toBe(0);
  });

  it('updates wall measurement and updates closure calculation', () => {
    useSiteCaptureStore.getState().setMeasurement('front', 4030, 2800);
    const closure = useSiteCaptureStore.getState().closure;
    expect(closure.isClosed).toBe(false);
    expect(closure.status).toBe('warning');
    expect(closure.closureErrorMm).toBe(30);
  });
});

