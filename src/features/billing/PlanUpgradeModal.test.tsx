import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanUpgradeModal } from './PlanUpgradeModal';

describe('PlanUpgradeModal Component', () => {
  it('renders modal with target tier and capability explanation', () => {
    render(
      <PlanUpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        onUpgrade={vi.fn()}
        currentTier="starter"
        targetTier="pro"
        featureKey="feature.design.3d.export_cad"
      />
    );

    expect(screen.getByTestId('plan-upgrade-modal')).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Pro Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/AutoCAD DXF & DWG Export/i)).toBeInTheDocument();
    expect(screen.getByText(/₹12,999/i)).toBeInTheDocument();
  });

  it('triggers onUpgrade when clicking Upgrade button', async () => {
    const onUpgrade = vi.fn();
    const user = userEvent.setup();

    render(
      <PlanUpgradeModal
        isOpen={true}
        onClose={vi.fn()}
        onUpgrade={onUpgrade}
        currentTier="starter"
        targetTier="pro"
      />
    );

    const upgradeBtn = screen.getByRole('button', { name: /Confirm Upgrade/i });
    await user.click(upgradeBtn);

    expect(onUpgrade).toHaveBeenCalledWith('pro');
  });

  it('calls onClose when clicking Cancel', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <PlanUpgradeModal
        isOpen={true}
        onClose={onClose}
        onUpgrade={vi.fn()}
        currentTier="starter"
        targetTier="pro"
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    await user.click(cancelBtn);

    expect(onClose).toHaveBeenCalled();
  });
});
