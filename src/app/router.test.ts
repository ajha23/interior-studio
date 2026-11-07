import { describe, expect, it } from 'vitest';
import { parseHash, routeHash } from './router';

describe('parseHash', () => {
  it('keeps the existing editor routes unchanged', () => {
    expect(parseHash('')).toEqual({ name: 'home' });
    expect(parseHash('#/')).toEqual({ name: 'home' });
    expect(parseHash('#/project/p_1')).toEqual({ name: 'editor', projectId: 'p_1' });
    expect(parseHash('#/home/h1')).toEqual({ name: 'house', homeId: 'h1' });
    expect(parseHash('#/home/h1/room/r2')).toEqual({ name: 'room', homeId: 'h1', roomId: 'r2' });
  });

  it('parses studio pages with their slug', () => {
    expect(parseHash('#/s/alpha/projects')).toEqual({ name: 'studio-projects', slug: 'alpha' });
    expect(parseHash('#/s/interior-studio/settings/members')).toEqual({ name: 'studio-settings', slug: 'interior-studio', section: 'members' });
  });

  it('parses studio projects: kitchens, homes and rooms of a home (spec 043)', () => {
    const id = '0d4b803d-fc55-4d14-8f57-ba2d454b4439';
    expect(parseHash(`#/s/alpha/p/${id}`)).toEqual({ name: 'cloud-kitchen', slug: 'alpha', projectId: id });
    expect(parseHash(`#/s/alpha/h/${id}`)).toEqual({ name: 'cloud-home', slug: 'alpha', homeId: id });
    expect(parseHash(`#/s/alpha/h/${id}/room/room_bed1`)).toEqual({ name: 'cloud-room', slug: 'alpha', homeId: id, roomId: 'room_bed1' });
    expect(parseHash('#/s/alpha/p/')).toEqual({ name: 'home' });
  });

  it('rejects slugs the database would not allow', () => {
    // organizations.slug check: ^[a-z0-9-]{2,60}$
    expect(parseHash('#/s/A/projects')).toEqual({ name: 'home' });
    expect(parseHash('#/s/a/projects')).toEqual({ name: 'home' });
    expect(parseHash(`#/s/${'x'.repeat(61)}/projects`)).toEqual({ name: 'home' });
    expect(parseHash('#/s/alpha/settings/billing')).toEqual({ name: 'home' });
  });
});

describe('routeHash', () => {
  it('round-trips every route', () => {
    for (const hash of ['#/', '#/project/p1', '#/home/h1', '#/home/h1/room/r1', '#/s/alpha/projects', '#/s/alpha/settings/members', '#/s/alpha/p/p1', '#/s/alpha/h/h1', '#/s/alpha/h/h1/room/r1']) {
      expect(`#${routeHash(parseHash(hash))}`).toBe(hash);
    }
  });
});
