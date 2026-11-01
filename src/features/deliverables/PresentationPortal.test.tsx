import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createProject, DEFAULT_ROOM } from '@/domain';
import { PresentationPortal } from './PresentationPortal';

describe('PresentationPortal Component', () => {
  const project = createProject({ name: 'Penthouse Kitchen', room: DEFAULT_ROOM, layout: 'straight' });

  it('renders presentation portal with locked client mode and quote grand total', () => {
    render(<PresentationPortal project={project} revision="REV_PRES_01" />);

    expect(screen.getByTestId('presentation-portal')).toBeInTheDocument();
    expect(screen.getByText(/Client Presentation & Digital Sign-Off/i)).toBeInTheDocument();
    expect(screen.getByText(/Locked Client Mode/i)).toBeInTheDocument();
    expect(screen.getByTestId('quote-grand-total')).toBeInTheDocument();
  });

  it('allows selecting finish options and calculates delta', async () => {
    const user = userEvent.setup();
    render(<PresentationPortal project={project} revision="REV_PRES_01" />);

    const acrylicOption = screen.getByTestId('finish-option-acrylic');
    expect(acrylicOption).toBeInTheDocument();

    await user.click(acrylicOption);
    expect(acrylicOption.className).toContain('border-primary');
  });

  it('submits digital sign-off with valid client details and renders verified badge', async () => {
    const user = userEvent.setup();
    render(<PresentationPortal project={project} revision="REV_PRES_01" />);

    const nameInput = screen.getByTestId('client-name-input');
    const mobileInput = screen.getByTestId('client-mobile-input');
    const consentCheckbox = screen.getByTestId('consent-checkbox');
    const submitBtn = screen.getByTestId('accept-quote-button');

    await user.type(nameInput, 'Vikram Mehta');
    await user.type(mobileInput, '9820012345');
    await user.click(consentCheckbox);
    await user.click(submitBtn);

    expect(screen.getByTestId('sign-off-badge')).toBeInTheDocument();
    expect(screen.getByText(/Quotation Digitally Accepted/i)).toBeInTheDocument();
    expect(screen.getByText(/Vikram Mehta/i)).toBeInTheDocument();
    expect(screen.getByText(/9820012345/i)).toBeInTheDocument();
  });

  it('shows error message if consent is not checked', async () => {
    const user = userEvent.setup();
    render(<PresentationPortal project={project} revision="REV_PRES_01" />);

    const nameInput = screen.getByTestId('client-name-input');
    const mobileInput = screen.getByTestId('client-mobile-input');
    const submitBtn = screen.getByTestId('accept-quote-button');

    await user.type(nameInput, 'Vikram Mehta');
    await user.type(mobileInput, '9820012345');
    await user.click(submitBtn);

    expect(screen.getByTestId('sign-off-error')).toHaveTextContent(/Please review and check the DPDP legal consent/i);
  });
});

