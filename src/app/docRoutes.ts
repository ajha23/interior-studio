/**
 * Where a document lives decides its address (spec 043): inside a studio, projects are studio
 * projects (`#/s/<slug>/p/<id>`, `#/s/<slug>/h/<id>`); outside one, they are projects on this
 * device (`#/project/<id>`, `#/home/<id>`). The app sets the studio when a studio page or studio
 * project opens, and clears it for a device project, so code that only knows "open this home"
 * (the assistant, home commands, the home plan) goes to the right place.
 */
import type { Route } from './router';

let studioSlug: string | null = null;

export function setStudioSlug(slug: string | null): void {
  studioSlug = slug;
}

export function currentStudioSlug(): string | null {
  return studioSlug;
}

export const docRoutes = {
  projects: (): Route => (studioSlug ? { name: 'studio-projects', slug: studioSlug } : { name: 'home' }),
  kitchen: (projectId: string): Route => (studioSlug ? { name: 'cloud-kitchen', slug: studioSlug, projectId } : { name: 'editor', projectId }),
  home: (homeId: string): Route => (studioSlug ? { name: 'cloud-home', slug: studioSlug, homeId } : { name: 'house', homeId }),
  room: (homeId: string, roomId: string): Route => (studioSlug ? { name: 'cloud-room', slug: studioSlug, homeId, roomId } : { name: 'room', homeId, roomId }),
};
