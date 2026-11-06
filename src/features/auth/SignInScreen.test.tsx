import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInScreen } from './SignInScreen';
import { ConfigErrorScreen } from './ConfigErrorScreen';
import { SessionContext, type SessionState } from './sessionContext';

function session(overrides: Partial<SessionState> = {}): SessionState {
  return {
    status: 'signed-out',
    user: null,
    memberships: [],
    error: null,
    signInWithGoogle: vi.fn(async () => {}),
    signInWithPassword: null,
    signOut: vi.fn(async () => {}),
    refreshMemberships: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderWith(value: SessionState) {
  return render(
    <SessionContext.Provider value={value}>
      <SignInScreen />
    </SessionContext.Provider>,
  );
}

afterEach(() => window.history.replaceState(null, '', '/'));

describe('SignInScreen', () => {
  it('offers one primary action: Continue with Google', () => {
    const value = session();
    renderWith(value);
    expect(screen.getByRole('heading', { name: 'Sign in to Interior Studio' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(value.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('hides the email form unless password sign-in is enabled for this build', () => {
    renderWith(session());
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with email' })).not.toBeInTheDocument();
  });

  it('signs in with email and password when enabled', async () => {
    const signInWithPassword = vi.fn(async () => {});
    renderWith(session({ signInWithPassword }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner.a@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with email' }));
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith('owner.a@example.test', 'password123'));
  });

  it('shows a session error as an alert', () => {
    renderWith(session({ error: 'Invalid login credentials' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid login credentials');
  });

  it('explains a cancelled Google sign-in without technical detail', () => {
    window.history.replaceState(null, '', '/?error=access_denied&error_description=User+denied');
    renderWith(session());
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in was cancelled.');
  });
});

describe('ConfigErrorScreen', () => {
  it('names what is missing', () => {
    render(<ConfigErrorScreen message="Missing configuration: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. Set them for this build." />);
    expect(screen.getByRole('heading', { name: 'Interior Studio is not configured' })).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/)).toBeInTheDocument();
  });
});
