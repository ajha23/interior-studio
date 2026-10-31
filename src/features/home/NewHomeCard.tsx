import { useState, type FormEvent } from 'react';
import { Home as HomeIcon } from 'lucide-react';
import { navigate } from '@/app/router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { parseHomeBrief } from '@/engine/home/brief';
import { HOME_STYLES, type HomeBrief, type HomeStyleId } from '@/engine/home/generate';
import { useHomeStore } from '@/state/homeStore';

/** Design a whole home (apartment or villa) from a brief: generated, furnished and ready to refine. */
export function NewHomeCard() {
  const [brief, setBrief] = useState<HomeBrief>({ bhk: 2, kind: 'apartment', style: 'modern' });
  const [area, setArea] = useState('');
  const [describe, setDescribe] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const sqft = Number(area.replace(/[^\d]/g, ''));
      const home = await useHomeStore.getState().create({ ...brief, ...(sqft >= 300 ? { carpetAreaSqft: sqft } : {}) });
      navigate({ name: 'house', homeId: home.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The home could not be created.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New home</CardTitle>
        <p className="text-sm text-muted-foreground">A whole apartment or villa, planned and furnished in one style. Then refine any room in detail.</p>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={create} aria-label="New home">
          <div className="flex flex-col gap-1">
            <Label htmlFor="home-describe">Describe it (optional)</Label>
            <Input
              id="home-describe"
              placeholder="e.g. 3BHK apartment, 1400 sq ft, warm wood"
              value={describe}
              onChange={(e) => {
                setDescribe(e.target.value);
                const parsed = parseHomeBrief(e.target.value);
                if (parsed) {
                  setBrief((b) => ({ ...b, ...parsed }));
                  if (parsed.carpetAreaSqft) setArea(String(parsed.carpetAreaSqft));
                }
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="home-kind">Type</Label>
              <Select id="home-kind" aria-label="Home type" value={brief.kind} onChange={(e) => setBrief((b) => ({ ...b, kind: e.target.value as HomeBrief['kind'] }))}>
                <option value="apartment">Apartment (one floor)</option>
                <option value="villa">Villa (two floors)</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="home-bhk">Bedrooms</Label>
              <Select id="home-bhk" aria-label="Bedrooms" value={brief.bhk} onChange={(e) => setBrief((b) => ({ ...b, bhk: Number(e.target.value) }))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}BHK
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="home-area">Carpet area (sq ft, optional)</Label>
              <Input id="home-area" inputMode="numeric" placeholder="auto" value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="home-style">Style</Label>
              <Select id="home-style" aria-label="Home style" value={brief.style ?? 'modern'} onChange={(e) => setBrief((b) => ({ ...b, style: e.target.value as HomeStyleId }))}>
                {Object.entries(HOME_STYLES).map(([id, s]) => (
                  <option key={id} value={id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            <HomeIcon /> Design home
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
