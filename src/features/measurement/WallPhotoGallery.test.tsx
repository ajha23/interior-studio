import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WallPhotoGallery } from './WallPhotoGallery';
import type { SitePhoto } from '@/domain/measurement/siteCapture';

describe('WallPhotoGallery (MT-03)', () => {
  const photos: SitePhoto[] = [
    {
      id: 'p1',
      projectId: 'proj_1',
      wallId: 'back',
      url: 'data:image/svg+xml;utf8,<svg></svg>',
      caption: 'Back wall electrical conduit',
      compassHeading: 0,
      capturedAtIso: new Date().toISOString(),
    },
  ];

  it('renders wall-filtered photos with compass heading and caption', () => {
    const handleAdd = vi.fn();
    const handleDelete = vi.fn();

    render(
      <WallPhotoGallery
        wallId="back"
        photos={photos}
        onAddPhoto={handleAdd}
        onDeletePhoto={handleDelete}
      />
    );

    expect(screen.getByText(/1 Photo Tagged to BACK Wall/)).toBeDefined();
    expect(screen.getByText('Back wall electrical conduit')).toBeDefined();
    expect(screen.getByText('0° Compass')).toBeDefined();
  });

  it('shows empty state for wall with no photos', () => {
    render(
      <WallPhotoGallery
        wallId="left"
        photos={photos}
        onAddPhoto={vi.fn()}
        onDeletePhoto={vi.fn()}
      />
    );

    expect(screen.getByText(/No photos attached to this wall yet/)).toBeDefined();
  });

  it('invokes onAddPhoto and onDeletePhoto callbacks', () => {
    const handleAdd = vi.fn();
    const handleDelete = vi.fn();

    render(
      <WallPhotoGallery
        wallId="back"
        photos={photos}
        onAddPhoto={handleAdd}
        onDeletePhoto={handleDelete}
      />
    );

    fireEvent.click(screen.getByTestId('add-wall-photo-btn'));
    expect(handleAdd).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('delete-photo-p1'));
    expect(handleDelete).toHaveBeenCalledWith('p1');
  });
});

