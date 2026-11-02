import { Camera, Trash2, Compass } from 'lucide-react';
import type { SitePhoto } from '@/domain/measurement/siteCapture';
import { Button } from '@/components/ui/button';

interface WallPhotoGalleryProps {
  wallId: 'back' | 'left' | 'right' | 'front';
  photos: SitePhoto[];
  onAddPhoto: (data: { url: string; caption?: string; compassHeading?: number }) => void;
  onDeletePhoto: (id: string) => void;
}

export function WallPhotoGallery({
  wallId,
  photos,
  onAddPhoto,
  onDeletePhoto,
}: WallPhotoGalleryProps) {
  const wallPhotos = photos.filter((p) => p.wallId === wallId);

  const handleSimulatedUpload = () => {
    // Simulated site photo capture or camera shutter action
    const mockDataUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="%23e2e8f0"/><text x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="%23475569">Site Photo: ${wallId.toUpperCase()} Wall</text></svg>`;

    onAddPhoto({
      url: mockDataUrl,
      caption: `Site capture for ${wallId} wall`,
      compassHeading: wallId === 'back' ? 0 : wallId === 'right' ? 90 : wallId === 'front' ? 180 : 270,
    });
  };

  return (
    <div className="space-y-3" data-testid={`wall-photo-gallery-${wallId}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">
          {wallPhotos.length} Photo{wallPhotos.length !== 1 ? 's' : ''} Tagged to {wallId.toUpperCase()} Wall
        </span>
        <Button
          size="xs"
          variant="outline"
          onClick={handleSimulatedUpload}
          data-testid="add-wall-photo-btn"
        >
          <Camera className="size-3.5 mr-1 text-primary" /> Attach Photo
        </Button>
      </div>

      {wallPhotos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
          No photos attached to this wall yet. Tap "Attach Photo" to record existing site conditions, conduits, or plumbing.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {wallPhotos.map((photo) => (
            <div
              key={photo.id}
              className="group relative overflow-hidden rounded-lg border bg-card text-xs shadow-sm"
              data-testid={`photo-thumbnail-${photo.id}`}
            >
              <img
                src={photo.url}
                alt={photo.caption || 'Site Photo'}
                className="h-28 w-full object-cover"
              />
              <div className="p-2 space-y-1">
                <p className="truncate font-medium text-[11px] text-foreground">
                  {photo.caption || `${wallId} wall`}
                </p>
                {photo.compassHeading !== undefined && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Compass className="size-3 text-primary" />
                    <span>{photo.compassHeading}° Compass</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onDeletePhoto(photo.id)}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-80 hover:opacity-100 transition-opacity"
                title="Delete photo"
                data-testid={`delete-photo-${photo.id}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

