import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInScreen } from './SignInScreen';
import { ConfigErrorScreen } from './ConfigErrorScreen';
import { SessionContext, type SessionState } from './sessionContext';
import { fakeSessionState } from './testSessionState';

const session = fakeSessionState;

function renderWith(value: SessionState) {
  return render(
    <SessionContext.Provider value={value}>
      <SignInScreen />
    </SessionContext.Provider>,
  );
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
});

describe('SignInScreen', () => {
  it('offers Google and an email sign-in code, with no password field in this build', () => {
    const value = session();
    renderWith(value);
    expect(screen.getByText('Continue with Google, or get a sign-in code by email.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Work email')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByRole('button', { name: 'Email me a sign-in code' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('refuses an invalid address before sending anything', async () => {
    const value = session();
    renderWith(value);
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'not-an-address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(value.sendEmailCode).not.toHaveBeenCalled();
  });

  it('after sending, shows the code step for that address', async () => {
    const value = session();
    renderWith(value);
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'new.person@studio.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
    await waitFor(() => expect(value.sendEmailCode).toHaveBeenCalledWith('new.person@studio.example'));
    expect(await screen.findByRole('status')).toHaveTextContent('We sent a code to new.person@studio.example. It works for 15 minutes.');
    expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
  });

  it('a send error stays on the email step as an alert', async () => {
    const sendEmailCode = vi.fn(async () => ({ ok: false as const, message: 'Too many sign-in emails right now. Try again in a few minutes or continue with Google.' }));
    renderWith(session({ sendEmailCode }));
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'a@b.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many sign-in emails right now.');
    expect(screen.getByLabelText('Work email')).toBeInTheDocument();
  });

  it('reopens on the code step after a reload while an address is pending in this tab', () => {
    sessionStorage.setItem('interior-studio:email-pending', 'pending@studio.example');
    renderWith(session());
    expect(screen.getByRole('status')).toHaveTextContent('We sent a code to pending@studio.example.');
  });

  it('offers one primary action: Continue with Google', () => {
    const value = session();
    renderWith(value);
    expect(screen.getByRole('heading', { name: 'Sign in to Interior Studio' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(value.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('hides the password form unless password sign-in is enabled for this build', () => {
    renderWith(session());
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with email' })).not.toBeInTheDocument();
    expect(screen.queryByText('Local test accounts only.')).not.toBeInTheDocument();
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
