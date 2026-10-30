/** Minimal hash routing: `#/` lists projects, `#/project/<id>` opens one (so reload reopens it). */
import { useSyncExternalStore } from 'react';

export type Route = { name: 'home' } | { name: 'editor'; projectId: string };

export function parseHash(hash: string): Route {
  const m = /^#\/project\/([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? { name: 'editor', projectId: m[1]! } : { name: 'home' };
}

export function navigate(route: Route): void {
  window.location.hash = route.name === 'editor' ? `/project/${route.projectId}` : '/';
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}
