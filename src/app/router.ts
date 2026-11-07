/**
 * Minimal hash routing: `#/` lists projects, `#/project/<id>` opens one, `#/home/<id>` opens a whole
 * home (plan and dollhouse), `#/home/<id>/room/<roomId>` edits one of its rooms (so reload reopens it).
 * Studio pages carry the studio's slug: `#/s/<slug>/projects` and `#/s/<slug>/settings/members`
 * (spec 042). Studio projects (spec 043): `#/s/<slug>/p/<id>` (kitchen), `#/s/<slug>/h/<id>` (home)
 * and `#/s/<slug>/h/<id>/room/<roomId>`; the routes above without a slug are projects on this device.
 * Every route needs a signed-in session; routing moves to a library in spec 049.
 */
import { useSyncExternalStore } from 'react';

export type SettingsSection = 'members';

export type Route =
  | { name: 'home' }
  | { name: 'editor'; projectId: string }
  | { name: 'house'; homeId: string }
  | { name: 'room'; homeId: string; roomId: string }
  | { name: 'studio-projects'; slug: string }
  | { name: 'studio-settings'; slug: string; section: SettingsSection }
  | { name: 'cloud-kitchen'; slug: string; projectId: string }
  | { name: 'cloud-home'; slug: string; homeId: string }
  | { name: 'cloud-room'; slug: string; homeId: string; roomId: string };

const ID = '[A-Za-z0-9_-]+';
/** The live `organizations.slug` check: `^[a-z0-9-]{2,60}$`. */
const SLUG = '[a-z0-9-]{2,60}';

export function parseHash(hash: string): Route {
  const projects = new RegExp(`^#/s/(${SLUG})/projects$`).exec(hash);
  if (projects) return { name: 'studio-projects', slug: projects[1]! };
  const settings = new RegExp(`^#/s/(${SLUG})/settings/(members)$`).exec(hash);
  if (settings) return { name: 'studio-settings', slug: settings[1]!, section: settings[2] as SettingsSection };
  const cloudKitchen = new RegExp(`^#/s/(${SLUG})/p/(${ID})$`).exec(hash);
  if (cloudKitchen) return { name: 'cloud-kitchen', slug: cloudKitchen[1]!, projectId: cloudKitchen[2]! };
  const cloudRoom = new RegExp(`^#/s/(${SLUG})/h/(${ID})/room/(${ID})$`).exec(hash);
  if (cloudRoom) return { name: 'cloud-room', slug: cloudRoom[1]!, homeId: cloudRoom[2]!, roomId: cloudRoom[3]! };
  const cloudHome = new RegExp(`^#/s/(${SLUG})/h/(${ID})$`).exec(hash);
  if (cloudHome) return { name: 'cloud-home', slug: cloudHome[1]!, homeId: cloudHome[2]! };
  const project = new RegExp(`^#/project/(${ID})$`).exec(hash);
  if (project) return { name: 'editor', projectId: project[1]! };
  const room = new RegExp(`^#/home/(${ID})/room/(${ID})$`).exec(hash);
  if (room) return { name: 'room', homeId: room[1]!, roomId: room[2]! };
  const house = new RegExp(`^#/home/(${ID})$`).exec(hash);
  if (house) return { name: 'house', homeId: house[1]! };
  return { name: 'home' };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'editor':
      return `/project/${route.projectId}`;
    case 'house':
      return `/home/${route.homeId}`;
    case 'room':
      return `/home/${route.homeId}/room/${route.roomId}`;
    case 'studio-projects':
      return `/s/${route.slug}/projects`;
    case 'studio-settings':
      return `/s/${route.slug}/settings/${route.section}`;
    case 'cloud-kitchen':
      return `/s/${route.slug}/p/${route.projectId}`;
    case 'cloud-home':
      return `/s/${route.slug}/h/${route.homeId}`;
    case 'cloud-room':
      return `/s/${route.slug}/h/${route.homeId}/room/${route.roomId}`;
    default:
      return '/';
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeHash(route);
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
