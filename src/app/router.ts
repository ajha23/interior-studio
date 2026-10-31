/**
 * Minimal hash routing: `#/` lists projects, `#/project/<id>` opens one, `#/home/<id>` opens a whole
 * home (plan and dollhouse), `#/home/<id>/room/<roomId>` edits one of its rooms (so reload reopens it).
 */
import { useSyncExternalStore } from 'react';

export type Route = { name: 'home' } | { name: 'editor'; projectId: string } | { name: 'house'; homeId: string } | { name: 'room'; homeId: string; roomId: string };

const ID = '[A-Za-z0-9_-]+';

export function parseHash(hash: string): Route {
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
