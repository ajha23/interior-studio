/**
 * The studio whose projects are open (spec 043). Set while a studio page or a studio project is on
 * screen; while it is set, new projects and homes are created in that studio and saved there.
 * The role only decides what the editor offers: the database refuses a viewer's save anyway.
 */
import { create } from 'zustand';
import { setStudioSlug } from '@/app/docRoutes';
import type { OrgRole } from '@/features/auth/sessionContext';
import * as cloud from '@/infrastructure/projects/cloudProjects';
import { supabase, type AppSupabaseClient } from '@/infrastructure/supabase/client';
import * as cache from '@/persistence/cloudCache';
import { deviceHomeStorage, setHomeStorage, type HomeStorage } from '@/state/homeStore';
import { useSyncStore } from './sync';

export interface StudioContext {
  client: AppSupabaseClient;
  userId: string;
  orgId: string;
  slug: string;
  name: string;
  role: OrgRole;
}

export const useStudioContext = create<{ studio: StudioContext | null }>()(() => ({ studio: null }));

export const canEdit = (role: OrgRole) => role !== 'viewer';

/** Homes created in the studio become studio projects; saving a studio home sends a version. */
function studioHomeStorage(studio: StudioContext): HomeStorage {
  return {
    create: async (home) => {
      const made = await cloud.createProject(studio.client, { orgId: studio.orgId, name: home.name, doc: { type: 'home', home }, idempotencyKey: crypto.randomUUID() });
      if (!made.ok) throw new Error(made.error.message);
      await cache.putDoc({ userId: studio.userId, orgId: studio.orgId, projectId: made.value.id, versionNo: 1, doc: made.value.doc, name: home.name });
      if (made.value.doc.type !== 'home') throw new Error('The studio returned a kitchen for a new home.');
      return made.value.doc.home;
    },
    save: async () => {
      if (!(await useSyncStore.getState().saveVersion())) throw new Error(useSyncStore.getState().error?.message ?? 'The home is not saved yet.');
    },
  };
}

/** The studio context for a membership, or null when Supabase is not configured. */
export function makeStudioContext(input: Omit<StudioContext, 'client'>, client: AppSupabaseClient | null = supabase): StudioContext | null {
  return client ? { ...input, client } : null;
}

/** Enters a studio: new projects are created and saved there. Returns a function that leaves it. */
export function enterStudio(studio: StudioContext): () => void {
  useStudioContext.setState({ studio });
  setStudioSlug(studio.slug);
  setHomeStorage(studioHomeStorage(studio));
  return () => {
    if (useStudioContext.getState().studio !== studio) return;
    useStudioContext.setState({ studio: null });
    setStudioSlug(null);
    setHomeStorage(deviceHomeStorage);
  };
}

export const currentStudio = () => useStudioContext.getState().studio;
