// Spec 045, User Story 3: the assistant says which studio pays, how many credits are left, and why
// AI is unavailable when it is.
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionContext, type Membership } from '@/features/auth/sessionContext';
import { fakeSessionState } from '@/features/auth/testSessionState';
import { AiCreditsBar } from './AiCreditsBar';
import { PayingStudioSync } from './PayingStudioSync';
import { clearPayingStudio, getPayingStudio, setPayingBalance, setPayingStudio } from './payingStudio';

const alpha: Membership = { orgId: 'org-a', orgName: 'Alpha Studio', orgSlug: 'alpha', role: 'designer', plan: 'inhouse' };
const beta: Membership = { orgId: 'org-b', orgName: 'Beta Studio', orgSlug: 'beta', role: 'viewer', plan: 'free' };

afterEach(() => {
  clearPayingStudio();
  localStorage.clear();
});

describe('AiCreditsBar', () => {
  it('shows the paying studio and its credits, "…" while loading', () => {
    setPayingStudio(alpha);
    render(<AiCreditsBar />);
    expect(screen.getByTestId('ai-credits')).toHaveTextContent('Alpha Studio · … credits');
    act(() => setPayingBalance('org-a', 500));
    expect(screen.getByTestId('ai-credits')).toHaveTextContent('Alpha Studio · 500 credits');
  });

  it('updates after a paid call reports a new balance (US3 scenario 3)', () => {
    setPayingStudio(alpha);
    setPayingBalance('org-a', 500);
    render(<AiCreditsBar />);
    act(() => setPayingBalance('org-a', 499));
    expect(screen.getByTestId('ai-credits')).toHaveTextContent('Alpha Studio · 499 credits');
  });

  it('one credit reads naturally', () => {
    setPayingStudio(alpha);
    setPayingBalance('org-a', 1);
    render(<AiCreditsBar />);
    expect(screen.getByTestId('ai-credits')).toHaveTextContent('Alpha Studio · 1 credit');
  });

  it('a studio with no credits says how to get more', () => {
    setPayingStudio(alpha);
    setPayingBalance('org-a', 0);
    render(<AiCreditsBar />);
    expect(screen.getByRole('status')).toHaveTextContent('Your studio has no AI credits left. Contact Interior Studio to add credits.');
  });

  it('a viewer is told AI is not for them', () => {
    setPayingStudio(beta);
    render(<AiCreditsBar />);
    expect(screen.getByRole('status')).toHaveTextContent("Viewers can't use AI. Ask a studio owner for designer access.");
  });

  it('with no studio, it says to open or join one', () => {
    render(<AiCreditsBar />);
    expect(screen.getByRole('status')).toHaveTextContent('Open or join a studio to use AI.');
  });
});

describe('PayingStudioSync', () => {
  function mount(memberships: Membership[], status: 'signed-in' | 'signed-out' = 'signed-in', balance = vi.fn(async () => 500)) {
    const view = render(
      <SessionContext.Provider value={fakeSessionState({ status, memberships })}>
        <PayingStudioSync loadBalance={balance} />
      </SessionContext.Provider>,
    );
    return { ...view, balance };
  }

  it('makes the only studio the payer and loads its balance', async () => {
    const { balance } = mount([alpha]);
    expect(getPayingStudio()).toMatchObject({ orgId: 'org-a', name: 'Alpha Studio' });
    await waitFor(() => expect(getPayingStudio()?.balance).toBe(500));
    expect(balance).toHaveBeenCalledWith('org-a');
  });

  it('follows the studio last opened in the shell', async () => {
    localStorage.setItem('interior-studio:last-studio', 'beta');
    mount([alpha, beta]);
    await waitFor(() => expect(getPayingStudio()?.orgId).toBe('org-b'));
  });

  it('clears the payer when signed out', () => {
    setPayingStudio(alpha);
    mount([alpha], 'signed-out');
    expect(getPayingStudio()).toBeNull();
  });
});
