/**
 * Settings → Studio details (spec 042, FR-022): the studio's name and plan. Owners and admins rename
 * the studio (the live `org_update` policy allows admin+); everyone else sees it read-only.
 */
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/infrastructure/supabase/client';
import type { Result } from './membersApi';
import type { Studio } from './useStudio';

export function planLabel(plan: string): string {
  if (plan === 'free') return 'Free plan';
  if (plan === 'pro') return 'Pro plan';
  if (plan === 'inhouse') return 'In-house';
  return plan;
}

/** Renames a studio as the signed-in user; row-level security refuses non-admins (no row back). */
export async function renameStudio(orgId: string, name: string): Promise<Result> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };
  const { data, error } = await supabase.from('organizations').update({ name }).eq('id', orgId).select('id');
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: 'Only owners and admins can rename the studio.' };
  return { ok: true };
}

export function StudioDetails({
  studio,
  rename = renameStudio,
  onRenamed,
}: {
  studio: Studio;
  rename?: (orgId: string, name: string) => Promise<Result>;
  onRenamed: () => Promise<void>;
}) {
  const { orgId, orgName, plan } = studio.membership;
  const canRename = studio.actions.changeRoles; // owners and admins, the same roles as org_update
  const [name, setName] = useState(orgName);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    if (next.length < 2 || next.length > 120) {
      setNotice({ tone: 'error', text: 'A studio name must be 2 to 120 characters.' });
      return;
    }
    setSaving(true);
    const result = await rename(orgId, next);
    setSaving(false);
    if (result.ok) {
      setNotice({ tone: 'ok', text: 'Studio renamed.' });
      await onRenamed();
    } else {
      setNotice({ tone: 'error', text: result.message });
    }
  };

  return (
    <section className="mx-auto grid max-w-3xl gap-3 px-6 pt-8">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold">Studio details</h1>
        <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{planLabel(plan)}</span>
      </div>
      {notice &&
        (notice.tone === 'ok' ? (
          <p role="status" className="rounded-md border bg-muted px-3 py-2 text-sm">
            {notice.text}
          </p>
        ) : (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {notice.text}
          </p>
        ))}
      {canRename ? (
        <form aria-label="Rename studio" onSubmit={(e) => void save(e)} className="flex items-end gap-3 rounded-lg border bg-card p-4">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="studio-name">Studio name</Label>
            <Input id="studio-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" disabled={saving || name.trim() === orgName}>
            {saving ? 'Saving…' : 'Save name'}
          </Button>
        </form>
      ) : (
        <p className="rounded-lg border bg-card p-4 text-sm">{orgName}</p>
      )}
    </section>
  );
}
