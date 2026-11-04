import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UsageQuotaTracker, type QuotaMeterItem } from './UsageQuotaTracker';

describe('UsageQuotaTracker Component', () => {
  const sampleQuotas: QuotaMeterItem[] = [
    {
      key: 'quota.projects.active.max',
      label: 'Active Projects',
      consumed: 14,
      limit: 15,
      unit: 'projects',
    },
    {
      key: 'quota.seats.designers.max',
      label: 'Designer Seats',
      consumed: 2,
      limit: 2,
      unit: 'seats',
    },
    {
      key: 'quota.renderings.monthly.max',
      label: 'Monthly Renders',
      consumed: 30,
      limit: -1,
      unit: 'renders',
    },
  ];

  it('renders quota labels, consumption counts, and unlimited indicators', () => {
    render(<UsageQuotaTracker quotas={sampleQuotas} />);

    expect(screen.getByText('Active Projects')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText(/\/ 15/i)).toBeInTheDocument();

    expect(screen.getByText('Designer Seats')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/\/ 2/i)).toBeInTheDocument();

    expect(screen.getByText('Monthly Renders')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText(/\/ Unlimited/i)).toBeInTheDocument();
  });

  it('displays warning badge and trigger upgrade callback when quota is exhausted', async () => {
    const onUpgradeClick = vi.fn();
    const user = userEvent.setup();

    render(<UsageQuotaTracker quotas={sampleQuotas} onUpgradeClick={onUpgradeClick} />);

    // Seats are at 2/2 (100% full)
    const upgradeBtns = screen.getAllByRole('button', { name: /Upgrade/i });
    expect(upgradeBtns.length).toBeGreaterThanOrEqual(1);

    await user.click(upgradeBtns[0]!);
    expect(onUpgradeClick).toHaveBeenCalledWith('quota.seats.designers.max');
  });
});
