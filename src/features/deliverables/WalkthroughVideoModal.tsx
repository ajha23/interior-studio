import { useState, useEffect } from 'react';
import { Film, Download, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import { useWalkthroughStore } from '@/state/walkthroughStore';
import { Button } from '@/components/ui/button';

interface WalkthroughVideoModalProps {
  projectId: string;
  room: { width: number; length: number; height: number };
}

export function WalkthroughVideoModal({ projectId, room }: WalkthroughVideoModalProps) {
  const { isModalOpen, closeModal, currentJob, startJob, updateJobProgress, completeJob } =
    useWalkthroughStore();

  const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p');

  // Simulated render loop when job is queued/rendering
  useEffect(() => {
    if (!currentJob) return;

    if (currentJob.status === 'queued') {
      const timer = setTimeout(() => {
        updateJobProgress(15);
      }, 500);
      return () => clearTimeout(timer);
    }

    if (currentJob.status === 'rendering' && currentJob.progressPct < 100) {
      const timer = setTimeout(() => {
        const next = Math.min(100, currentJob.progressPct + 25);
        if (next >= 100) {
          completeJob('blob:http://localhost:3000/walkthrough-30s-1080p.mp4');
        } else {
          updateJobProgress(next);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentJob, updateJobProgress, completeJob]);

  if (!isModalOpen) return null;

  const handleStart = () => {
    startJob(projectId, room, { durationSec: 30, resolution });
  };

  const handleDownload = () => {
    if (!currentJob?.downloadUrl) return;
    const a = document.createElement('a');
    a.href = currentJob.downloadUrl;
    a.download = `walkthrough_${projectId}_${currentJob.resolution}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-xl border bg-card p-6 shadow-2xl" data-testid="walkthrough-video-modal">
        <button
          onClick={closeModal}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-2 pb-3 border-b">
          <Film className="size-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">Cinematic 3D Video Walkthrough (PR-04)</h2>
            <p className="text-xs text-muted-foreground">
              Automated 30-second camera path interpolation & rendering worker
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {!currentJob ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-accent/30 p-4 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-accent-foreground">
                  <Sparkles className="size-4 text-amber-500" />
                  <span>Camera Trajectory Specifications</span>
                </div>
                <p className="text-muted-foreground">
                  • <strong>Duration:</strong> 30 Seconds (900 frames @ 30 FPS)
                </p>
                <p className="text-muted-foreground">
                  • <strong>Waypoints:</strong> Entry portal → Kitchen run glide → Pivoting interior scan → Wide elevation
                </p>
                <p className="text-muted-foreground">
                  • <strong>Worker Queue:</strong> Async headless worker with sub-second progress streaming
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground block mb-2">Resolution Preset</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setResolution('1080p')}
                    className={`rounded-lg border p-3 text-left text-xs transition-all ${
                      resolution === '1080p'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:bg-accent/40'
                    }`}
                    data-testid="res-1080p-btn"
                  >
                    <span className="font-semibold block">Full HD (1080p)</span>
                    <span className="text-[11px] text-muted-foreground">1920 × 1080 @ 30fps</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolution('720p')}
                    className={`rounded-lg border p-3 text-left text-xs transition-all ${
                      resolution === '720p'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:bg-accent/40'
                    }`}
                    data-testid="res-720p-btn"
                  >
                    <span className="font-semibold block">HD (720p)</span>
                    <span className="text-[11px] text-muted-foreground">1280 × 720 @ 30fps</span>
                  </button>
                </div>
              </div>

              <Button onClick={handleStart} className="w-full" data-testid="start-video-render-btn">
                <Film className="size-4 mr-2" /> Start 30s Video Rendering
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{currentJob.title}</span>
                  <span className="font-bold text-primary">{currentJob.progressPct}%</span>
                </div>

                {/* Progress Bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${currentJob.progressPct}%` }}
                    data-testid="render-progress-bar"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {currentJob.status !== 'ready' ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                      <span>
                        {currentJob.status === 'queued'
                          ? 'Dispatching render task to async worker...'
                          : 'Synthesizing camera trajectory frames (H.264/MP4)...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        Rendering Complete · Ready for Client Presentation
                      </span>
                    </>
                  )}
                </div>
              </div>

              {currentJob.status === 'ready' && (
                <div className="flex gap-2">
                  <Button
                    onClick={handleDownload}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    data-testid="download-video-btn"
                  >
                    <Download className="size-4 mr-2" /> Download 1080p MP4
                  </Button>
                  <Button variant="outline" onClick={closeModal}>
                    Close
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

