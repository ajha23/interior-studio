import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanAuthParams,
  clearEmailReturnTo,
  clearPendingEmail,
  readPendingEmail,
  rememberReturnTo,
  saveEmailReturnTo,
  savePendingEmail,
  takeEmailReturnTo,
  takeReturnTo,
} from './returnTo';

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

describe('email return-to hint (spec 054, research R7)', () => {
  const KEY = 'interior-studio:email-return-to';
  afterEach(() => localStorage.clear());

  it('stores the hash with a time in localStorage, so the link can open in a new tab', () => {
    saveEmailReturnTo('#/s/alpha/settings/members', 1_000);
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toEqual({ hash: '#/s/alpha/settings/members', at: 1_000 });
  });

  it('returns the hash once, then nothing', () => {
    saveEmailReturnTo('#/s/alpha/projects', 1_000);
    expect(takeEmailReturnTo(1_000 + 60_000)).toBe('#/s/alpha/projects');
    expect(takeEmailReturnTo(1_000 + 60_000)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('ignores and removes a hint older than 15 minutes', () => {
    saveEmailReturnTo('#/s/alpha/projects', 0);
    expect(takeEmailReturnTo(15 * 60_000 + 1)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('ignores empty, root and non-route hashes, and garbage in storage', () => {
    saveEmailReturnTo('#/', 0);
    saveEmailReturnTo('', 0);
    saveEmailReturnTo('javascript:alert(1)', 0);
    expect(localStorage.getItem(KEY)).toBeNull();
    localStorage.setItem(KEY, 'not json');
    expect(takeEmailReturnTo(0)).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ hash: 'https://evil.example', at: 0 }));
    expect(takeEmailReturnTo(0)).toBeNull();
  });

  it('clearEmailReturnTo removes it (sign-out)', () => {
    saveEmailReturnTo('#/s/alpha/projects', 0);
    clearEmailReturnTo();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('pending email address (spec 054, data-model)', () => {
  afterEach(() => sessionStorage.clear());

  it('keeps the address for this tab until cleared', () => {
    expect(readPendingEmail()).toBeNull();
    savePendingEmail('new.person@studio.example');
    expect(sessionStorage.getItem('interior-studio:email-pending')).toBe('new.person@studio.example');
    expect(readPendingEmail()).toBe('new.person@studio.example');
    clearPendingEmail();
    expect(readPendingEmail()).toBeNull();
  });
});
