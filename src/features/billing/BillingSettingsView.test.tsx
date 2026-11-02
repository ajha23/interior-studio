import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useBillingStore } from '@/state/billingStore';
import { BillingSettingsView } from './BillingSettingsView';

describe('BillingSettingsView Component (BIL-07)', () => {
  beforeEach(() => {
    useBillingStore.setState({
      currentTier: 'pro',
      cycle: 'monthly',
      subscription: {
        id: 'sub_test_01',
        orgId: 'org_inhouse_01',
        planId: 'pro',
        cycle: 'monthly',
        status: 'active',
        currentPeriodStart: '2024-10-01T00:00:00Z',
        currentPeriodEnd: '2024-11-01T00:00:00Z',
      },
    });
  });

  it('renders active subscription card with renewal date and Razorpay details', () => {
    render(<BillingSettingsView />);

    expect(screen.getByTestId('billing-settings-view')).toBeInTheDocument();
    expect(screen.getAllByText('Pro Studio').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('ACTIVE SUBSCRIPTION')).toBeInTheDocument();
    expect(screen.getByText('Razorpay Subscriptions (eMandate)')).toBeInTheDocument();
  });

  it('renders plan options and switches billing cycle between monthly and annual', async () => {
    const user = userEvent.setup();
    render(<BillingSettingsView />);

    expect(screen.getByTestId('plan-card-starter')).toBeInTheDocument();
    expect(screen.getByTestId('plan-card-pro')).toBeInTheDocument();
    expect(screen.getByTestId('plan-card-enterprise')).toBeInTheDocument();

    // Toggle annual cycle
    const annualBtn = screen.getByRole('button', { name: /annual/i });
    await user.click(annualBtn);

    expect(useBillingStore.getState().cycle).toBe('annual');
  });

  it('allows upgrading or switching to another plan', async () => {
    const user = userEvent.setup();
    render(<BillingSettingsView />);

    const selectEnterpriseBtn = screen.getByTestId('select-plan-enterprise');
    await user.click(selectEnterpriseBtn);

    expect(useBillingStore.getState().currentTier).toBe('enterprise');
    expect(screen.getByText(/Successfully switched subscription to Enterprise Factory/i)).toBeInTheDocument();
  });

  it('renders statutory GST invoices table with download actions', () => {
    render(<BillingSettingsView />);

    expect(screen.getByTestId('invoices-table')).toBeInTheDocument();
    expect(screen.getByText('INV-2024-10-0982')).toBeInTheDocument();
    expect(screen.getAllByText('PAID').length).toBeGreaterThanOrEqual(1);
  });
});
