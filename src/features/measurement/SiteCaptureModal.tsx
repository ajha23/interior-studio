import { useState } from 'react';
import { Ruler, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useSiteCaptureStore } from '@/state/siteCaptureStore';
import { WallPhotoGallery } from './WallPhotoGallery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const WALL_TABS = [
  { id: 'back', label: 'Back Wall' },
  { id: 'left', label: 'Left Wall' },
  { id: 'right', label: 'Right Wall' },
  { id: 'front', label: 'Front Wall' },
] as const;

export function SiteCaptureModal({ projectId }: { projectId: string }) {
  const {
    isModalOpen,
    closeModal,
    activeWall,
    setActiveWall,
    measurements,
    setMeasurement,
    photos,
    addPhoto,
    deletePhoto,
    closure,
  } = useSiteCaptureStore();

  const currentWallMeasurement =
    measurements.find((m) => m.wallId === activeWall) ?? {
      wallId: activeWall,
      lengthMm: 4000,
      heightMm: 2800,
    };

  const [lengthInput, setLengthInput] = useState(String(currentWallMeasurement.lengthMm));
  const [heightInput, setHeightInput] = useState(String(currentWallMeasurement.heightMm));
  const [notesInput, setNotesInput] = useState(currentWallMeasurement.notes || '');

  // Synchronize inputs when wall tab switches
  const handleSelectWall = (wallId: 'back' | 'left' | 'right' | 'front') => {
    setActiveWall(wallId);
    const m = measurements.find((item) => item.wallId === wallId);
    if (m) {
      setLengthInput(String(m.lengthMm));
      setHeightInput(String(m.heightMm));
      setNotesInput(m.notes || '');
    }
  };

  const handleSaveWallMeasurement = (e: React.FormEvent) => {
    e.preventDefault();
    const l = parseInt(lengthInput, 10);
    const h = parseInt(heightInput, 10);
    if (!isNaN(l) && !isNaN(h) && l > 0 && h > 0) {
      setMeasurement(activeWall, l, h, notesInput);
    }
  };

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded-xl border bg-card shadow-2xl overflow-hidden"
        data-testid="site-capture-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Ruler className="size-5 text-primary" />
            <div>
              <h2 className="text-sm sm:text-base font-semibold">Site Measurement & Photo Capture (MT-03, MT-05)</h2>
              <p className="text-[11px] text-muted-foreground">
                Mobile-responsive site capture with ±10mm wall-closure tolerance validation
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            data-testid="close-site-capture-btn"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Closure Diagnostic Alert Banner */}
        <div
          className={`flex items-start gap-2.5 border-b p-3 text-xs ${
            closure.status === 'acceptable'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-950 dark:text-emerald-100'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-950 dark:text-amber-100'
          }`}
          data-testid="closure-diagnostic-banner"
        >
          {closure.status === 'acceptable' ? (
            <CheckCircle2 className="size-4 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="size-4 text-amber-600 mt-0.5 shrink-0" />
          )}
          <div className="flex-1">
            <span className="font-semibold block">
              {closure.status === 'acceptable'
                ? `Closure Error: ${closure.closureErrorMm}mm (Within ±10mm Tolerance)`
                : `Closure Error: ${closure.closureErrorMm}mm (Tolerance Exceeded)`}
            </span>
            <span className="text-[11px] opacity-90">{closure.message}</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Wall Tabs (Horizontal Scrollable for Mobile down to 360px) */}
          <div className="flex gap-2 overflow-x-auto pb-1 border-b" data-testid="wall-tabs">
            {WALL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectWall(tab.id)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  activeWall === tab.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/50'
                }`}
                data-testid={`wall-tab-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Wall Measurement Inputs */}
          <form onSubmit={handleSaveWallMeasurement} className="space-y-3 rounded-lg border bg-accent/20 p-3 sm:p-4 text-xs">
            <div className="flex items-center justify-between pb-1">
              <span className="font-semibold">{activeWall.toUpperCase()} Wall Dimensions</span>
              <span className="text-[10px] text-muted-foreground">Integer mm</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground block mb-1">Measured Length (mm) *</label>
                <Input
                  type="number"
                  value={lengthInput}
                  onChange={(e) => setLengthInput(e.target.value)}
                  required
                  data-testid="wall-length-input"
                />
              </div>
              <div>
                <label className="text-muted-foreground block mb-1">Wall Height (mm) *</label>
                <Input
                  type="number"
                  value={heightInput}
                  onChange={(e) => setHeightInput(e.target.value)}
                  required
                  data-testid="wall-height-input"
                />
              </div>
            </div>

            <div>
              <label className="text-muted-foreground block mb-1">Site Obstacle Notes</label>
              <Input
                placeholder="e.g. 150mm plumbing drain rough-in at 450mm offset"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                data-testid="wall-notes-input"
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="xs" data-testid="save-wall-dimension-btn">
                Update Wall & Check Closure
              </Button>
            </div>
          </form>

          {/* Wall-Tagged Photo Gallery */}
          <WallPhotoGallery
            wallId={activeWall}
            photos={photos}
            onAddPhoto={(photo) =>
              addPhoto({
                projectId,
                wallId: activeWall,
                ...photo,
              })
            }
            onDeletePhoto={deletePhoto}
          />
        </div>
      </div>
    </div>
  );
}
