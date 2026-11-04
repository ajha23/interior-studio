import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useBillingStore } from '@/state/billingStore';
import { UpgradeModal } from './UpgradeModal';

describe('UpgradeModal Component (ENT-07, BIL-04)', () => {
  beforeEach(() => {
    useBillingStore.setState({
      currentTier: 'starter',
      upgradeModalOpen: true,
      upgradeModalFeature: 'drawings.dxf',
      upgradeModalTargetTier: 'pro',
    });
  });

  it('renders upgrade modal with feature name, target plan, and perks', () => {
    render(<UpgradeModal />);

    expect(screen.getByTestId('upgrade-modal-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Pro Studio Required/i)).toBeInTheDocument();
    expect(screen.getByText('AutoCAD 2D DXF Export')).toBeInTheDocument();
    expect(screen.getByText(/AutoCAD DXF 2D CAD floor plans with layers/i)).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-now-btn')).toBeInTheDocument();
  });

  it('upgrades plan when Upgrade button is clicked', async () => {
    const user = userEvent.setup();
    render(<UpgradeModal />);

    await user.click(screen.getByTestId('upgrade-now-btn'));

    // Should have upgraded to Pro and closed modal
    expect(useBillingStore.getState().currentTier).toBe('pro');
    expect(useBillingStore.getState().upgradeModalOpen).toBe(false);
  });

  it('closes modal when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<UpgradeModal />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(useBillingStore.getState().upgradeModalOpen).toBe(false);
  });
});

