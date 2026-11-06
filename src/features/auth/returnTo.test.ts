import { afterEach, describe, expect, it } from 'vitest';
import { cleanAuthParams, rememberReturnTo, takeReturnTo } from './returnTo';

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('return-to across the sign-in redirect', () => {
  it('remembers a hash once and clears it when taken', () => {
    rememberReturnTo('#/s/alpha/settings/members');
    expect(takeReturnTo()).toBe('#/s/alpha/settings/members');
    expect(takeReturnTo()).toBeNull();
  });

  it('ignores an empty or root hash', () => {
    rememberReturnTo('');
    expect(takeReturnTo()).toBeNull();
    rememberReturnTo('#/');
    expect(takeReturnTo()).toBeNull();
  });
});

describe('cleanAuthParams', () => {
  it('removes the OAuth parameters and keeps the hash and other parameters', () => {
    window.history.replaceState(null, '', '/?code=abc&error=x&error_description=y&keep=1#/s/alpha/projects');
    cleanAuthParams();
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.hash).toBe('#/s/alpha/projects');
  });

  it('leaves a clean address untouched', () => {
    window.history.replaceState(null, '', '/#/project/p1');
    cleanAuthParams();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/#/project/p1');
  });
});
