// Spec 054, User Story 1 and FR-003: the code step of email sign-in.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailCodeForm } from './EmailCodeForm';

function setup(overrides: Partial<Parameters<typeof EmailCodeForm>[0]> = {}) {
  const props = {
    email: 'new.person@studio.example',
    sentAt: Date.now(),
    onVerify: vi.fn(async () => ({ ok: true }) as const),
    onResend: vi.fn(async () => ({ ok: true }) as const),
    onChangeEmail: vi.fn(),
    ...overrides,
  };
  render(<EmailCodeForm {...props} />);
  return props;
}

describe('EmailCodeForm', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('says where the code went and how long it works, and focuses a one-time-code field', () => {
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('We sent a code to new.person@studio.example. It works for 15 minutes.');
    const field = screen.getByLabelText('6-digit code');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field).toHaveAttribute('maxlength', '6');
    expect(field).toHaveFocus();
  });

  it('a pasted code with spaces is cleaned and submitted', async () => {
    const props = setup();
    const field = screen.getByLabelText('6-digit code');
    fireEvent.paste(field, { clipboardData: { getData: () => ' 123 456 ' } });
    expect(field).toHaveValue('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(props.onVerify).toHaveBeenCalledWith('123456'));
  });

  it('typing keeps digits only, up to six', () => {
    setup();
    const field = screen.getByLabelText('6-digit code');
    fireEvent.change(field, { target: { value: '12a34-5678' } });
    expect(field).toHaveValue('123456');
  });

  it('asks for six digits before verifying', async () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the 6-digit code from the email.');
    expect(props.onVerify).not.toHaveBeenCalled();
  });

  it('a wrong code shows the error and keeps the field for another try', async () => {
    setup({ onVerify: vi.fn(async () => ({ ok: false as const, message: 'That code is not right or has expired.' })) });
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right or has expired.');
    expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
  });

  it('"Use a different email" goes back', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(props.onChangeEmail).toHaveBeenCalledTimes(1);
  });

  it('resend waits 60 seconds with a countdown, then sends again and restarts the wait', async () => {
    const props = setup();
    expect(screen.getByRole('button', { name: 'Resend in 60 s' })).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole('button', { name: 'Resend in 30 s' })).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    const resend = screen.getByRole('button', { name: 'Resend email' });
    expect(resend).toBeEnabled();
    fireEvent.click(resend);
    await waitFor(() => expect(props.onResend).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'Resend in 60 s' })).toBeDisabled();
  });

  it('a refused resend shows why and waits as long as the server says', async () => {
    setup({
      sentAt: Date.now() - 61_000,
      onResend: vi.fn(async () => ({ ok: false as const, message: 'Please wait 20 seconds before asking for another email.', retryAfterSeconds: 20 })),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please wait 20 seconds');
    expect(screen.getByRole('button', { name: 'Resend in 20 s' })).toBeDisabled();
  });

  it('keyboard only: Enter in the code field submits (spec 054, T032)', async () => {
    const props = setup();
    const field = screen.getByLabelText('6-digit code');
    fireEvent.change(field, { target: { value: '654321' } });
    fireEvent.submit(field.closest('form')!);
    await waitFor(() => expect(props.onVerify).toHaveBeenCalledWith('654321'));
  });
});
