// Spec 054, User Story 2 and FR-004: the emailed link opens a page whose one button signs in.
// Opening the page does nothing, so mail scanners cannot use the link up.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailLinkConfirm, EmailLinkGate, readEmailLinkToken } from './EmailLinkConfirm';
import { SessionContext, type SessionState } from './sessionContext';
import { fakeSessionState } from './testSessionState';

function renderWith(value: SessionState, tokenHash: string | null = 'pkce_abc', onDone = vi.fn()) {
  const view = render(
    <SessionContext.Provider value={value}>
      <EmailLinkConfirm tokenHash={tokenHash} onDone={onDone} />
    </SessionContext.Provider>,
  );
  return { ...view, onDone };
}

afterEach(() => window.history.replaceState(null, '', '/'));

describe('EmailLinkConfirm', () => {
  it('shows one "Sign in" button and does not use the link on open', () => {
    const value = fakeSessionState();
    renderWith(value);
    expect(screen.getByRole('heading', { name: 'Sign in to Interior Studio' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus();
    expect(value.confirmEmailLink).not.toHaveBeenCalled();
  });

  it('the click uses the link once', async () => {
    const value = fakeSessionState();
    renderWith(value);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(value.confirmEmailLink).toHaveBeenCalledWith('pkce_abc'));
    expect(value.confirmEmailLink).toHaveBeenCalledTimes(1);
  });

  it('a used or expired link says so and offers the way back', async () => {
    const value = fakeSessionState({ confirmEmailLink: vi.fn(async () => ({ ok: false as const, message: 'This sign-in link has expired.' })) });
    renderWith(value);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This sign-in link has expired.');
    expect(screen.getByRole('link', { name: 'Back to sign-in' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('without a token it shows the expired state', () => {
    renderWith(fakeSessionState(), null);
    expect(screen.getByRole('alert')).toHaveTextContent('This sign-in link has expired.');
  });

  it('once signed in, it removes the token from the address bar, keeps the restored page and hands over', async () => {
    window.history.replaceState(null, '', '/auth/confirm?token_hash=pkce_abc&type=email#/s/alpha/projects');
    const { onDone } = renderWith(fakeSessionState({ status: 'signed-in' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#/s/alpha/projects');
  });

  it('already signed in: no click needed, lands on #/', async () => {
    window.history.replaceState(null, '', '/auth/confirm?token_hash=pkce_old&type=email');
    const value = fakeSessionState({ status: 'signed-in' });
    const { onDone } = renderWith(value, 'pkce_old');
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/#/');
    expect(value.confirmEmailLink).not.toHaveBeenCalled();
  });
});

describe('readEmailLinkToken', () => {
  it('reads token_hash from the query string on any path', () => {
    expect(readEmailLinkToken('?token_hash=pkce_abc&type=email')).toBe('pkce_abc');
    expect(readEmailLinkToken('?type=email&token_hash=xyz')).toBe('xyz');
    expect(readEmailLinkToken('')).toBeNull();
    expect(readEmailLinkToken('?code=oauth')).toBeNull();
  });
});

describe('EmailLinkGate', () => {
  it('with a token in the address, shows the link page instead of the app, then the app after sign-in', async () => {
    window.history.replaceState(null, '', '/auth/confirm?token_hash=pkce_abc&type=email');
    const value = fakeSessionState();
    const { rerender } = render(
      <SessionContext.Provider value={value}>
        <EmailLinkGate>
          <p>the app</p>
        </EmailLinkGate>
      </SessionContext.Provider>,
    );
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
    await act(async () => {
      rerender(
        <SessionContext.Provider value={{ ...value, status: 'signed-in' }}>
          <EmailLinkGate>
            <p>the app</p>
          </EmailLinkGate>
        </SessionContext.Provider>,
      );
    });
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  it('without a token, renders the app unchanged', () => {
    window.history.replaceState(null, '', '/#/s/alpha/projects');
    render(
      <SessionContext.Provider value={fakeSessionState()}>
        <EmailLinkGate>
          <p>the app</p>
        </EmailLinkGate>
      </SessionContext.Provider>,
    );
    expect(screen.getByText('the app')).toBeInTheDocument();
  });
});
