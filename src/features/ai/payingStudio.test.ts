// Spec 045, clarification 2 and FR-010: which studio pays for AI in the editor, and its balance.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Membership } from '@/features/auth/sessionContext';
import { choosePayer, clearPayingStudio, getPayingStudio, setPayingBalance, setPayingStudio, subscribePayingStudio } from './payingStudio';

const alpha: Membership = { orgId: 'org-a', orgName: 'Alpha Studio', orgSlug: 'alpha', role: 'designer', plan: 'inhouse' };
const beta: Membership = { orgId: 'org-b', orgName: 'Beta Studio', orgSlug: 'beta', role: 'viewer', plan: 'free' };

afterEach(() => clearPayingStudio());

describe('choosePayer', () => {
  it('the studio last opened in the shell pays', () => {
    expect(choosePayer([alpha, beta], 'beta')).toBe(beta);
    expect(choosePayer([alpha, beta], 'alpha')).toBe(alpha);
  });

  it('otherwise the only studio pays', () => {
    expect(choosePayer([alpha], null)).toBe(alpha);
    expect(choosePayer([alpha], 'gone')).toBe(alpha);
  });

  it('with several studios and none opened yet, nobody pays (the user opens one first)', () => {
    expect(choosePayer([alpha, beta], null)).toBeNull();
    expect(choosePayer([], 'alpha')).toBeNull();
  });
});

describe('paying studio store', () => {
  it('holds the payer, its role and its balance, and tells subscribers', () => {
    const seen = vi.fn();
    const stop = subscribePayingStudio(seen);
    setPayingStudio(alpha);
    expect(getPayingStudio()).toEqual({ orgId: 'org-a', name: 'Alpha Studio', role: 'designer', balance: null });
    setPayingBalance('org-a', 500);
    expect(getPayingStudio()?.balance).toBe(500);
    expect(seen).toHaveBeenCalledTimes(2);
    stop();
  });

  it('switching studio resets the balance until it is loaded', () => {
    setPayingStudio(alpha);
    setPayingBalance('org-a', 500);
    setPayingStudio(beta);
    expect(getPayingStudio()).toMatchObject({ orgId: 'org-b', balance: null });
  });

  it('a balance for a studio that no longer pays is ignored (a late reply)', () => {
    setPayingStudio(beta);
    setPayingBalance('org-a', 500);
    expect(getPayingStudio()?.balance).toBeNull();
  });

  it('setting the same studio again keeps its balance', () => {
    setPayingStudio(alpha);
    setPayingBalance('org-a', 480);
    setPayingStudio(alpha);
    expect(getPayingStudio()?.balance).toBe(480);
  });

  it('clears on sign-out', () => {
    setPayingStudio(alpha);
    clearPayingStudio();
    expect(getPayingStudio()).toBeNull();
  });
});
